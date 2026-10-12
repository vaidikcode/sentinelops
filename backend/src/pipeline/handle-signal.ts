import { appendTimeline, createIncident } from "../domain/incident.js";
import type { Incident, NormalizedSignal } from "../domain/types.js";
import { classifySignal } from "../classification/classify.js";
import { decide } from "../policy/engine.js";
import { MAX_RECEIVE_COUNT } from "./retry.js";
import { DuplicateEventError } from "../store/errors.js";
import type { IncidentRepository } from "../store/types.js";
import type { Remediator } from "../remediation/types.js";
import type { Verifier } from "../verification/types.js";
import type { Notifier } from "../notifications/types.js";
import type { Archiver } from "../archive/types.js";

const RETRYABLE_STATUSES = new Set<Incident["status"]>([
  "FAILED",
  "REMEDIATION_PENDING",
  "REMEDIATING",
  "VERIFYING",
]);

export interface PipelineDeps {
  store: IncidentRepository;
  remediator: Remediator;
  verifier: Verifier;
  notifier: Notifier;
  archiver: Archiver;
  now: () => string;
  createId: () => string;
}

export type HandleResult =
  | { kind: "ignored"; reason: string }
  | { kind: "duplicate"; incident: Incident }
  | { kind: "recorded"; incident: Incident }
  | { kind: "completed"; incident: Incident }
  | { kind: "failed"; incident: Incident };

export async function handleSignal(signal: NormalizedSignal, deps: PipelineDeps): Promise<HandleResult> {
  const classification = classifySignal(signal);
  if (!classification) {
    return { kind: "ignored", reason: "Signal is inside policy thresholds" };
  }

  const existing = await deps.store.findByEventId(signal.eventId);
  if (existing) {
    if (RETRYABLE_STATUSES.has(existing.status) && signal.receiveCount > existing.attempts) {
      return runRemediation(existing, signal, deps);
    }
    return { kind: "duplicate", incident: existing };
  }

  const policy = decide({
    type: classification.type,
    environment: signal.environment,
    autoRecover: signal.autoRecover,
    hasScaleTarget: Boolean(signal.scaleTarget),
  });

  let incident = createIncident({
    incidentId: deps.createId(),
    signal,
    type: classification.type,
    severity: policy.severity,
    action: policy.action,
    now: deps.now(),
  });
  incident = appendTimeline(incident, "Incident detected", "DETECTED", deps.now());
  incident = appendTimeline(incident, `Classified ${policy.severity}`, "CLASSIFIED", deps.now());

  if (policy.mode !== "automatic") {
    const status = policy.mode === "approval_required" ? "REQUIRES_APPROVAL" : "CLASSIFIED";
    const message =
      policy.mode === "approval_required"
        ? policy.reason
        : "No automatic remediation for this incident";
    incident = appendTimeline(incident, message, status, deps.now());
    const raced = await claim(incident, deps);
    if (raced) return { kind: "duplicate", incident: raced };
    await deps.notifier.notify(incident);
    await archiveQuietly(incident, deps);
    return { kind: "recorded", incident };
  }

  incident = appendTimeline(incident, policy.reason, "REMEDIATION_PENDING", deps.now());
  const raced = await claim(incident, deps);
  if (raced) return { kind: "duplicate", incident: raced };
  return runRemediation(incident, signal, deps);
}

async function claim(incident: Incident, deps: PipelineDeps): Promise<Incident | null> {
  try {
    await deps.store.insert(incident);
    return null;
  } catch (error) {
    if (error instanceof DuplicateEventError) {
      const winner = await deps.store.findByEventId(incident.eventId);
      if (!winner) throw error;
      return winner;
    }
    throw error;
  }
}

async function runRemediation(
  incident: Incident,
  signal: NormalizedSignal,
  deps: PipelineDeps,
): Promise<HandleResult> {
  let current = appendTimeline(
    { ...incident, attempts: signal.receiveCount },
    "Remediation started",
    "REMEDIATING",
    deps.now(),
  );
  await deps.store.save(current);

  try {
    const remediation = await deps.remediator.execute(current);
    current = appendTimeline(
      { ...current, remediationResult: remediation },
      remediation.summary,
      "REMEDIATING",
      deps.now(),
    );

    if (!remediation.ok && remediation.approvalRequired) {
      current = appendTimeline(
        { ...current, errorDetails: remediation.summary },
        "Remediation stopped pending approval",
        "REQUIRES_APPROVAL",
        deps.now(),
      );
      await deps.store.save(current);
      await deps.notifier.notify(current);
      await archiveQuietly(current, deps);
      return { kind: "recorded", incident: current };
    }

    if (!remediation.ok) {
      throw new Error(remediation.summary);
    }

    current = appendTimeline(current, "Verification started", "VERIFYING", deps.now());
    await deps.store.save(current);

    const verification = await deps.verifier.verify(current);
    current = { ...current, verificationResult: verification };

    if (verification.ok) {
      current = appendTimeline(
        { ...current, resolvedAt: deps.now() },
        "Verification successful",
        "VERIFYING",
        deps.now(),
      );
      current = appendTimeline(current, "Incident resolved", "RESOLVED", deps.now());
      await deps.store.save(current);
      await deps.notifier.notify(current);
      await archiveQuietly(current, deps);
      return { kind: "completed", incident: current };
    }

    current = appendTimeline(
      { ...current, errorDetails: verification.detail },
      `Verification failed: ${verification.detail}`,
      "FAILED",
      deps.now(),
    );
    current = appendTimeline(current, "Administrator notified", "FAILED", deps.now());
    await deps.store.save(current);
    await deps.notifier.notify(current);
    await archiveQuietly(current, deps);
    return { kind: "failed", incident: current };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Remediation failed";
    const exhausted = signal.receiveCount >= MAX_RECEIVE_COUNT;
    current = appendTimeline(
      { ...current, errorDetails: message },
      exhausted
        ? `Remediation failed (attempt ${signal.receiveCount}); message will move to the dead-letter queue`
        : `Remediation failed (attempt ${signal.receiveCount}); will retry`,
      "FAILED",
      deps.now(),
    );
    await deps.store.save(current);
    throw error;
  }
}

export async function markFromDeadLetter(
  signal: NormalizedSignal,
  deps: Pick<PipelineDeps, "store" | "notifier" | "archiver" | "now" | "createId">,
): Promise<Incident> {
  const existing = await deps.store.findByEventId(signal.eventId);
  if (!existing) {
    const classification = classifySignal(signal);
    const policy = decide({
      type: classification?.type ?? "UNKNOWN",
      environment: signal.environment,
      autoRecover: signal.autoRecover,
      hasScaleTarget: Boolean(signal.scaleTarget),
    });
    let incident = createIncident({
      incidentId: deps.createId(),
      signal,
      type: policy.incidentType,
      severity: policy.severity,
      action: policy.action,
      now: deps.now(),
    });
    incident = appendTimeline(
      incident,
      "Processing retries exhausted before an incident could be completed",
      "REQUIRES_ATTENTION",
      deps.now(),
    );
    incident = { ...incident, errorDetails: "Dead-letter queue" };
    await deps.store.insert(incident);
    await deps.notifier.notify(incident);
    await archiveQuietly(incident, deps);
    return incident;
  }

  if (existing.status === "RESOLVED" || existing.status === "REQUIRES_ATTENTION") {
    return existing;
  }

  const updated = appendTimeline(
    {
      ...existing,
      errorDetails: existing.errorDetails ?? "Processing retries exhausted",
    },
    "Moved to the dead-letter queue; requires attention",
    "REQUIRES_ATTENTION",
    deps.now(),
  );
  await deps.store.save(updated);
  await deps.notifier.notify(updated);
  await archiveQuietly(updated, deps);
  return updated;
}

async function archiveQuietly(incident: Incident, deps: { archiver: Archiver }): Promise<void> {
  try {
    await deps.archiver.archive(incident);
  } catch (error) {
    console.error("Audit archive failed", {
      incidentId: incident.incidentId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
