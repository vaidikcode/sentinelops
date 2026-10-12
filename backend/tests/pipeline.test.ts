import assert from "node:assert/strict";
import test from "node:test";
import { MemoryArchiver } from "../src/archive/memory.js";
import type { NormalizedSignal } from "../src/domain/types.js";
import { MemoryNotifier } from "../src/notifications/memory.js";
import { handleSignal, markFromDeadLetter, type PipelineDeps } from "../src/pipeline/handle-signal.js";
import { ScriptedRemediator } from "../src/remediation/scripted.js";
import { MemoryIncidentStore } from "../src/store/memory-store.js";
import { ScriptedVerifier } from "../src/verification/scripted.js";

test("public bucket runs the full lifecycle once", async () => {
  const rig = createRig();
  const signal = publicBucket("evt-1");
  const result = await handleSignal(signal, rig.deps);

  assert.equal(result.kind, "completed");
  if (result.kind !== "completed") return;
  assert.equal(result.incident.status, "RESOLVED");
  assert.equal(result.incident.severity, "CRITICAL");
  assert.equal(result.incident.remediationAction, "BLOCK_PUBLIC_ACCESS");
  assert.equal(rig.remediator.calls.length, 1);
  assert.deepEqual(
    result.incident.timeline.map((entry) => entry.message),
    [
      "Incident detected",
      "Classified CRITICAL",
      "Approved block of public bucket access",
      "Remediation started",
      "BLOCK_PUBLIC_ACCESS completed for company-data",
      "Verification started",
      "Verification successful",
      "Incident resolved",
    ],
  );
  assert.equal(rig.notifier.sent.at(-1)?.status, "RESOLVED");
  assert.equal(rig.archiver.objects.at(-1)?.status, "RESOLVED");
});

test("the same event does not remediate twice", async () => {
  const rig = createRig();
  const signal = publicBucket("evt-dup");
  const first = await handleSignal(signal, rig.deps);
  const second = await handleSignal(signal, rig.deps);

  assert.equal(first.kind, "completed");
  assert.equal(second.kind, "duplicate");
  assert.equal(rig.remediator.calls.length, 1);
  assert.equal((await rig.store.list()).length, 1);
});

test("unknown incidents are stored without remediation", async () => {
  const rig = createRig();
  const result = await handleSignal(
    {
      kind: "UNKNOWN",
      eventId: "evt-unknown",
      observedAt: "2026-10-12T14:32:00Z",
      receiveCount: 1,
      resourceId: "manual-change",
      resourceType: "UNKNOWN",
      trigger: "Unrecognized event",
      rawType: "custom",
    },
    rig.deps,
  );

  assert.equal(result.kind, "recorded");
  if (result.kind !== "recorded") return;
  assert.equal(result.incident.status, "CLASSIFIED");
  assert.equal(result.incident.remediationAction, "ALERT_ONLY");
  assert.equal(rig.remediator.calls.length, 0);
  assert.equal(rig.notifier.sent.length, 1);
});

test("production instance recovery waits for approval", async () => {
  const rig = createRig();
  const result = await handleSignal(
    {
      kind: "EC2_STATUS_CHECK_FAILED",
      eventId: "evt-prod",
      observedAt: "2026-10-12T14:32:00Z",
      receiveCount: 1,
      resourceId: "i-prod",
      resourceType: "EC2",
      trigger: "status check failed",
      environment: "production",
    },
    rig.deps,
  );

  assert.equal(result.kind, "recorded");
  if (result.kind !== "recorded") return;
  assert.equal(result.incident.status, "REQUIRES_APPROVAL");
  assert.equal(rig.remediator.calls.length, 0);
});

test("development instance recovery reboots", async () => {
  const rig = createRig();
  const result = await handleSignal(
    {
      kind: "EC2_STATUS_CHECK_FAILED",
      eventId: "evt-dev",
      observedAt: "2026-10-12T14:32:00Z",
      receiveCount: 1,
      resourceId: "i-dev",
      resourceType: "EC2",
      trigger: "status check failed",
      environment: "development",
      autoRecover: true,
    },
    rig.deps,
  );
  assert.equal(result.kind, "completed");
  assert.equal(rig.remediator.calls.length, 1);
  assert.equal(rig.remediator.calls[0]?.remediationAction, "RECOVER_INSTANCE");
});

test("failed remediation retries then the dead-letter path requires attention", async () => {
  const rig = createRig();
  rig.remediator.failuresRemaining = 3;
  const signal = publicBucket("evt-fail");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await assert.rejects(() => handleSignal({ ...signal, receiveCount: attempt }, rig.deps));
  }

  assert.equal(rig.remediator.calls.length, 3);
  const attention = await markFromDeadLetter({ ...signal, receiveCount: 3 }, rig.deps);
  assert.equal(attention.status, "REQUIRES_ATTENTION");
  assert.equal((await rig.store.list()).length, 1);
});

test("verification failure stays unresolved and notifies", async () => {
  const rig = createRig();
  rig.verifier.failWith = "Bucket is still publicly accessible";
  const result = await handleSignal(publicBucket("evt-verify"), rig.deps);

  assert.equal(result.kind, "failed");
  if (result.kind !== "failed") return;
  assert.equal(result.incident.status, "FAILED");
  assert.equal(result.incident.remediationResult?.ok, true);
  assert.equal(result.incident.verificationResult?.ok, false);
  assert.equal(rig.notifier.sent.at(-1)?.status, "FAILED");
  assert.equal(rig.remediator.calls.length, 1);
});

test("a quiet CPU sample creates no incident", async () => {
  const rig = createRig();
  const result = await handleSignal(
    {
      kind: "CPU_HIGH",
      eventId: "evt-cpu-ok",
      observedAt: "2026-10-12T14:32:00Z",
      receiveCount: 1,
      resourceId: "i-1",
      resourceType: "EC2",
      trigger: "cpu",
      cpuPercent: 20,
      durationMinutes: 5,
      scaleTarget: "web",
    },
    rig.deps,
  );
  assert.equal(result.kind, "ignored");
  assert.equal((await rig.store.list()).length, 0);
});

function createRig() {
  const store = new MemoryIncidentStore();
  const remediator = new ScriptedRemediator();
  const verifier = new ScriptedVerifier();
  const notifier = new MemoryNotifier();
  const archiver = new MemoryArchiver();
  let id = 0;
  const deps: PipelineDeps = {
    store,
    remediator,
    verifier,
    notifier,
    archiver,
    now: () => "2026-10-12T14:32:00Z",
    createId: () => {
      id += 1;
      return `INC-2026-00${id}`;
    },
  };
  return { store, remediator, verifier, notifier, archiver, deps };
}

function publicBucket(eventId: string): NormalizedSignal {
  return {
    kind: "S3_PUBLIC",
    eventId,
    observedAt: "2026-10-12T14:32:00Z",
    receiveCount: 1,
    resourceId: "company-data",
    resourceType: "S3",
    trigger: "Bucket became public",
    publicAccess: true,
  };
}
