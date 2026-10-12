import assert from "node:assert/strict";
import test from "node:test";
import { parseEvent } from "../src/events/parse.js";
import { isPublicAccessBlocked, nextDesiredCapacity, publicAccessBlockConfiguration, publicSshRevocations } from "../src/remediation/plan.js";
import { formatAlert } from "../src/notifications/format.js";
import type { Incident } from "../src/domain/types.js";

test("parser accepts a direct public bucket event and ignores a healthy alarm", () => {
  const signal = parseEvent(
    {
      source: "sentinelops.incidents",
      id: "evt-direct",
      time: "2026-10-12T14:32:00Z",
      detail: {
        kind: "S3_PUBLIC",
        resourceId: "company-data",
        resourceType: "S3",
        trigger: "public",
        publicAccess: true,
      },
    },
    2,
  );
  assert.equal(signal?.kind, "S3_PUBLIC");
  assert.equal(signal?.receiveCount, 2);

  const ok = parseEvent(
    {
      source: "aws.cloudwatch",
      id: "evt-ok",
      time: "2026-10-12T14:32:00Z",
      detail: { alarmName: "sentinelops-ec2-cpu-i-1", state: { value: "OK" } },
    },
    1,
  );
  assert.equal(ok, null);
});

test("parser maps config noncompliance and cloudwatch cpu alarms", () => {
  const config = parseEvent(
    {
      source: "aws.config",
      id: "evt-config",
      time: "2026-10-12T14:32:00Z",
      detail: {
        configRuleName: "S3_BUCKET_PUBLIC_READ_PROHIBITED",
        resourceId: "company-data",
        newEvaluationResult: { complianceType: "NON_COMPLIANT" },
      },
    },
    1,
  );
  assert.equal(config?.kind, "S3_PUBLIC");

  const alarm = parseEvent(
    {
      source: "aws.cloudwatch",
      id: "evt-cpu",
      time: "2026-10-12T14:32:00Z",
      detail: {
        alarmName: "sentinelops-ec2-cpu-i-abc",
        state: { value: "ALARM" },
        configuration: {
          threshold: 80,
          metrics: [
            {
              metricStat: {
                metric: { dimensions: { InstanceId: "i-abc", AutoScalingGroupName: "web" } },
              },
            },
          ],
        },
      },
    },
    1,
  );
  assert.equal(alarm?.kind, "CPU_HIGH");
  if (alarm?.kind === "CPU_HIGH") {
    assert.equal(alarm.resourceId, "i-abc");
    assert.equal(alarm.scaleTarget, "web");
    assert.ok(alarm.cpuPercent > 80);
  }
});

test("remediation plans are idempotent and bounded", () => {
  const block = publicAccessBlockConfiguration();
  assert.equal(isPublicAccessBlocked(block), true);
  assert.equal(isPublicAccessBlocked(undefined), false);

  const revocations = publicSshRevocations([
    {
      IpProtocol: "tcp",
      FromPort: 22,
      ToPort: 22,
      IpRanges: [{ CidrIp: "10.0.0.0/16" }, { CidrIp: "0.0.0.0/0" }],
      Ipv6Ranges: [{ CidrIpv6: "::/0" }],
    },
    { IpProtocol: "tcp", FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: "0.0.0.0/0" }] },
  ]);
  assert.equal(revocations.length, 1);
  assert.deepEqual(revocations[0]?.IpRanges, [{ CidrIp: "0.0.0.0/0" }]);
  assert.equal(nextDesiredCapacity(2, 4), 3);
  assert.throws(() => nextDesiredCapacity(4, 4));
});

test("alert text names the resource and outcome", () => {
  const incident: Incident = {
    incidentId: "INC-2026-001",
    eventId: "evt",
    type: "PUBLIC_S3_BUCKET",
    resourceId: "company-data",
    resourceType: "S3",
    severity: "CRITICAL",
    detectedAt: "2026-10-12T14:32:00Z",
    status: "RESOLVED",
    trigger: "public",
    remediationAction: "BLOCK_PUBLIC_ACCESS",
    attempts: 1,
    context: {},
    timeline: [],
    remediationResult: {
      ok: true,
      summary: "Public access blocked",
      at: "2026-10-12T14:33:00Z",
    },
  };
  const alert = formatAlert(incident);
  assert.match(alert, /CRITICAL INCIDENT/);
  assert.match(alert, /company-data/);
  assert.match(alert, /Public access blocked/);
});
