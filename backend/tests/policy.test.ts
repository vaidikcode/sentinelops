import assert from "node:assert/strict";
import test from "node:test";
import { classifySignal } from "../src/classification/classify.js";
import type { NormalizedSignal } from "../src/domain/types.js";
import { decide, policyFor } from "../src/policy/engine.js";
import { INCIDENT_TYPES } from "../src/domain/types.js";

test("every incident type has a policy", () => {
  for (const type of INCIDENT_TYPES) {
    const rule = policyFor(type);
    assert.equal(rule.incidentType, type);
    assert.ok(rule.action);
    assert.ok(rule.severity);
  }
});

test("public S3 is critical and automatic", () => {
  const decision = decide({ type: "PUBLIC_S3_BUCKET" });
  assert.equal(decision.severity, "CRITICAL");
  assert.equal(decision.action, "BLOCK_PUBLIC_ACCESS");
  assert.equal(decision.mode, "automatic");
});

test("public SSH is critical and automatic", () => {
  const decision = decide({ type: "DANGEROUS_SECURITY_GROUP" });
  assert.equal(decision.severity, "CRITICAL");
  assert.equal(decision.mode, "automatic");
  assert.equal(decision.action, "REMOVE_PUBLIC_SSH_RULE");
});

test("unknown incidents are alert only", () => {
  const decision = decide({ type: "UNKNOWN" });
  assert.equal(decision.mode, "alert_only");
  assert.equal(decision.action, "ALERT_ONLY");
  assert.equal(decision.severity, "LOW");
});

test("production recovery requires approval unless tagged", () => {
  const blocked = decide({ type: "EC2_UNHEALTHY", environment: "production" });
  assert.equal(blocked.mode, "approval_required");
  const allowed = decide({ type: "EC2_UNHEALTHY", environment: "production", autoRecover: true });
  assert.equal(allowed.mode, "automatic");
});

test("scaling without a target requires approval", () => {
  assert.equal(decide({ type: "EC2_CPU_OVERLOAD" }).mode, "approval_required");
  assert.equal(decide({ type: "EC2_CPU_OVERLOAD", hasScaleTarget: true }).mode, "automatic");
  assert.equal(decide({ type: "SQS_QUEUE_BACKLOG" }).mode, "approval_required");
});

test("classification thresholds", () => {
  assert.equal(classifySignal(cpu(79, 5)), null);
  assert.equal(classifySignal(cpu(81, 4)), null);
  assert.equal(classifySignal(cpu(81, 5))?.type, "EC2_CPU_OVERLOAD");
  assert.equal(
    classifySignal({
      kind: "SG_PUBLIC_SSH",
      eventId: "e",
      observedAt: "2026-10-12T00:00:00Z",
      receiveCount: 1,
      resourceId: "sg",
      resourceType: "SECURITY_GROUP",
      trigger: "ssh",
      port: 443,
      cidr: "0.0.0.0/0",
    }),
    null,
  );
  assert.equal(
    classifySignal({
      kind: "S3_PUBLIC",
      eventId: "e",
      observedAt: "2026-10-12T00:00:00Z",
      receiveCount: 1,
      resourceId: "bucket",
      resourceType: "S3",
      trigger: "s3",
      publicAccess: false,
    }),
    null,
  );
});

function cpu(cpuPercent: number, durationMinutes: number): NormalizedSignal {
  return {
    kind: "CPU_HIGH",
    eventId: "cpu",
    observedAt: "2026-10-12T00:00:00Z",
    receiveCount: 1,
    resourceId: "i-1",
    resourceType: "EC2",
    trigger: "cpu",
    cpuPercent,
    durationMinutes,
  };
}
