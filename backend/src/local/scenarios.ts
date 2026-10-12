import { MemoryArchiver } from "../archive/memory.js";
import type { Incident, NormalizedSignal } from "../domain/types.js";
import { MemoryNotifier } from "../notifications/memory.js";
import { handleSignal, markFromDeadLetter, type HandleResult, type PipelineDeps } from "../pipeline/handle-signal.js";
import { ScriptedRemediator } from "../remediation/scripted.js";
import { MemoryIncidentStore } from "../store/memory-store.js";
import { ScriptedVerifier } from "../verification/scripted.js";

export const SCENARIO_NAMES = [
  "public-s3",
  "unhealthy-ec2",
  "cpu-overload",
  "open-ssh",
  "queue-backlog",
  "duplicate",
  "remediation-failure",
  "verification-failure",
  "unknown",
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export interface ScenarioOutcome {
  scenario: ScenarioName;
  incidents: Incident[];
  notes: string[];
}

let sequence = 0;

function nextIncidentId(): string {
  sequence += 1;
  return `INC-${new Date().getUTCFullYear()}-${String(sequence).padStart(4, "0")}`;
}

function nextEventId(scenario: string): string {
  sequence += 1;
  return `evt-${scenario}-${sequence}`;
}

export function isScenarioName(value: string): value is ScenarioName {
  return (SCENARIO_NAMES as readonly string[]).includes(value);
}

export async function runScenario(name: ScenarioName, store: MemoryIncidentStore): Promise<ScenarioOutcome> {
  switch (name) {
    case "public-s3":
      return runSingle(name, store, publicS3(nextEventId(name)), ["Detected, blocked public access, verified, resolved."]);
    case "unhealthy-ec2":
      return runSingle(name, store, unhealthyEc2(nextEventId(name)), ["Development instance reboot was approved by policy."]);
    case "cpu-overload":
      return runSingle(name, store, cpuOverload(nextEventId(name)), ["Auto Scaling desired capacity was raised by one."]);
    case "open-ssh":
      return runSingle(name, store, openSsh(nextEventId(name)), ["Public SSH rule was removed and the group was verified."]);
    case "queue-backlog":
      return runSingle(name, store, queueBacklog(nextEventId(name)), ["Consumer capacity was scaled and the queue was checked."]);
    case "unknown":
      return runSingle(name, store, unknownSignal(nextEventId(name)), ["Unknown signal was recorded. No remediation ran."]);
    case "duplicate":
      return runDuplicate(store);
    case "remediation-failure":
      return runRemediationFailure(store);
    case "verification-failure":
      return runVerificationFailure(store);
  }
}

async function runSingle(
  scenario: ScenarioName,
  store: MemoryIncidentStore,
  signal: NormalizedSignal,
  notes: string[],
): Promise<ScenarioOutcome> {
  const { deps, remediator } = build(store);
  const result = await handleSignal(signal, deps);
  if (scenario === "unknown" && remediator.calls.length !== 0) {
    throw new Error("Unknown incidents must not be remediated");
  }
  return { scenario, incidents: incidentsFrom([result]), notes };
}

async function runDuplicate(store: MemoryIncidentStore): Promise<ScenarioOutcome> {
  const { deps, remediator } = build(store);
  const signal = publicS3(nextEventId("duplicate"));
  const first = await handleSignal(signal, deps);
  const second = await handleSignal(signal, deps);
  return {
    scenario: "duplicate",
    incidents: incidentsFrom([first, second]),
    notes: [
      `First result: ${first.kind}.`,
      `Second result: ${second.kind}.`,
      `Remediation calls: ${remediator.calls.length}.`,
    ],
  };
}

async function runRemediationFailure(store: MemoryIncidentStore): Promise<ScenarioOutcome> {
  const { deps } = build(store, { failures: 3 });
  const signal = publicS3(nextEventId("remediation-failure"));
  signal.resourceId = "audit-logs";
  const results: HandleResult[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      results.push(await handleSignal({ ...signal, receiveCount: attempt }, deps));
    } catch (error) {
      const message = error instanceof Error ? error.message : "remediation failed";
      results.push({
        kind: "failed",
        incident: (await store.findByEventId(signal.eventId)) ?? signalAsMissing(signal, message),
      });
    }
  }
  const attention = await markFromDeadLetter({ ...signal, receiveCount: 3 }, deps);
  return {
    scenario: "remediation-failure",
    incidents: [attention],
    notes: [
      ...results.map((result, index) => {
        const status = result.kind === "ignored" ? "ignored" : result.incident.status;
        return `Attempt ${index + 1}: ${status}.`;
      }),
      "Dead-letter handler marked the incident REQUIRES_ATTENTION.",
    ],
  };
}

async function runVerificationFailure(store: MemoryIncidentStore): Promise<ScenarioOutcome> {
  const { deps, remediator } = build(store, { verifyFail: "Bucket is still publicly accessible" });
  const signal = publicS3(nextEventId("verification-failure"));
  signal.resourceId = "customer-exports";
  const result = await handleSignal(signal, deps);
  return {
    scenario: "verification-failure",
    incidents: incidentsFrom([result]),
    notes: [
      "Remediation reported success, verification did not, so the incident stayed unresolved.",
      `Remediation calls: ${remediator.calls.length}.`,
    ],
  };
}

function build(
  store: MemoryIncidentStore,
  options: { failures?: number; verifyFail?: string } = {},
): { deps: PipelineDeps; remediator: ScriptedRemediator; notifier: MemoryNotifier } {
  const remediator = new ScriptedRemediator();
  remediator.failuresRemaining = options.failures ?? 0;
  const verifier = new ScriptedVerifier();
  verifier.failWith = options.verifyFail ?? null;
  const notifier = new MemoryNotifier();
  const deps: PipelineDeps = {
    store,
    remediator,
    verifier,
    notifier,
    archiver: new MemoryArchiver(),
    now: () => new Date().toISOString(),
    createId: nextIncidentId,
  };
  return { deps, remediator, notifier };
}

function incidentsFrom(results: HandleResult[]): Incident[] {
  const incidents: Incident[] = [];
  for (const result of results) {
    if (result.kind !== "ignored") incidents.push(result.incident);
  }
  return incidents;
}

function signalAsMissing(signal: NormalizedSignal, message: string): Incident {
  return {
    incidentId: "missing",
    eventId: signal.eventId,
    type: "PUBLIC_S3_BUCKET",
    resourceId: signal.resourceId,
    resourceType: "S3",
    severity: "CRITICAL",
    detectedAt: signal.observedAt,
    status: "FAILED",
    trigger: signal.trigger,
    remediationAction: "BLOCK_PUBLIC_ACCESS",
    attempts: signal.receiveCount,
    context: {},
    timeline: [],
    errorDetails: message,
  };
}

function publicS3(eventId: string): NormalizedSignal {
  return {
    kind: "S3_PUBLIC",
    eventId,
    observedAt: new Date().toISOString(),
    receiveCount: 1,
    resourceId: "company-data",
    resourceType: "S3",
    trigger: "Bucket public access block disabled",
    publicAccess: true,
  };
}

function unhealthyEc2(eventId: string): NormalizedSignal {
  return {
    kind: "EC2_STATUS_CHECK_FAILED",
    eventId,
    observedAt: new Date().toISOString(),
    receiveCount: 1,
    resourceId: "i-dev-unhealthy",
    resourceType: "EC2",
    trigger: "Instance status check failed",
    environment: "development",
    autoRecover: true,
  };
}

function cpuOverload(eventId: string): NormalizedSignal {
  return {
    kind: "CPU_HIGH",
    eventId,
    observedAt: new Date().toISOString(),
    receiveCount: 1,
    resourceId: "i-web-01",
    resourceType: "EC2",
    trigger: "CPU above 80% for 5 minutes",
    cpuPercent: 96,
    durationMinutes: 5,
    scaleTarget: "sentinelops-web",
  };
}

function openSsh(eventId: string): NormalizedSignal {
  return {
    kind: "SG_PUBLIC_SSH",
    eventId,
    observedAt: new Date().toISOString(),
    receiveCount: 1,
    resourceId: "sg-demo",
    resourceType: "SECURITY_GROUP",
    trigger: "SSH open to 0.0.0.0/0",
    port: 22,
    cidr: "0.0.0.0/0",
  };
}

function queueBacklog(eventId: string): NormalizedSignal {
  return {
    kind: "QUEUE_BACKLOG",
    eventId,
    observedAt: new Date().toISOString(),
    receiveCount: 1,
    resourceId: "https://sqs.us-east-1.amazonaws.com/000000000000/orders",
    resourceType: "SQS",
    trigger: "ApproximateNumberOfMessages above threshold",
    depth: 250,
    threshold: 100,
    scaleTarget: "sentinelops-workers",
  };
}

function unknownSignal(eventId: string): NormalizedSignal {
  return {
    kind: "UNKNOWN",
    eventId,
    observedAt: new Date().toISOString(),
    receiveCount: 1,
    resourceId: "manual-change",
    resourceType: "UNKNOWN",
    trigger: "Unrecognized event",
    rawType: "aws.ec2.spotinterruption",
  };
}
