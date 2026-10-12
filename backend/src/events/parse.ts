import type { EnvironmentName, NormalizedSignal, ResourceType, SignalKind } from "../domain/types.js";

const SIGNAL_KINDS = new Set<SignalKind>([
  "CPU_HIGH",
  "EC2_STATUS_CHECK_FAILED",
  "S3_PUBLIC",
  "SG_PUBLIC_SSH",
  "QUEUE_BACKLOG",
  "UNKNOWN",
]);

export function parseEvent(body: unknown, receiveCount: number): NormalizedSignal | null {
  if (!isRecord(body)) {
    throw new Error("Event body must be an object");
  }
  const source = stringField(body, "source");
  if (source?.endsWith(".incidents")) {
    return parseDirect(body, receiveCount);
  }
  if (source === "aws.cloudwatch") {
    return parseAlarm(body, receiveCount);
  }
  if (source === "aws.config") {
    return parseConfig(body, receiveCount);
  }
  throw new Error(`Unsupported event source: ${source ?? "missing"}`);
}

function parseDirect(body: Record<string, unknown>, receiveCount: number): NormalizedSignal {
  const detail = recordField(body, "detail");
  if (!detail) throw new Error("Direct event is missing detail");
  const kind = stringField(detail, "kind");
  if (!kind || !SIGNAL_KINDS.has(kind as SignalKind)) {
    throw new Error(`Unsupported signal kind: ${kind ?? "missing"}`);
  }
  const base = baseFrom(body, detail, receiveCount, stringField(detail, "resourceType") as ResourceType);
  switch (kind) {
    case "CPU_HIGH":
      return {
        ...base,
        kind,
        resourceType: "EC2",
        cpuPercent: requiredNumber(detail, "cpuPercent"),
        durationMinutes: requiredNumber(detail, "durationMinutes"),
      };
    case "EC2_STATUS_CHECK_FAILED":
      return { ...base, kind, resourceType: "EC2" };
    case "S3_PUBLIC":
      return {
        ...base,
        kind,
        resourceType: "S3",
        publicAccess: requiredBoolean(detail, "publicAccess"),
      };
    case "SG_PUBLIC_SSH":
      return {
        ...base,
        kind,
        resourceType: "SECURITY_GROUP",
        port: requiredNumber(detail, "port"),
        cidr: requiredString(detail, "cidr"),
      };
    case "QUEUE_BACKLOG":
      return {
        ...base,
        kind,
        resourceType: "SQS",
        depth: requiredNumber(detail, "depth"),
        threshold: requiredNumber(detail, "threshold"),
      };
    case "UNKNOWN":
      return { ...base, kind, rawType: stringField(detail, "rawType") ?? "unspecified" };
    default:
      throw new Error(`Unsupported signal kind: ${kind}`);
  }
}

function parseAlarm(body: Record<string, unknown>, receiveCount: number): NormalizedSignal | null {
  const detail = recordField(body, "detail");
  if (!detail) throw new Error("CloudWatch event is missing detail");
  const state = recordField(detail, "state");
  if (stringField(state, "value") !== "ALARM") return null;

  const alarmName = requiredString(detail, "alarmName");
  const configuration = recordField(detail, "configuration") ?? {};
  const threshold = typeof configuration.threshold === "number" ? configuration.threshold : 80;
  const dimensions = readDimensions(configuration);
  const observedAt = stringField(body, "time") ?? new Date().toISOString();
  const eventId = requiredString(body, "id");

  if (alarmName.includes("-ec2-cpu")) {
    const resourceId = dimensions.InstanceId ?? alarmName.split("-").at(-1) ?? alarmName;
    return {
      kind: "CPU_HIGH",
      eventId,
      observedAt,
      receiveCount,
      resourceId,
      resourceType: "EC2",
      trigger: `CloudWatch alarm ${alarmName}`,
      cpuPercent: Math.max(threshold + 1, 81),
      durationMinutes: 5,
      scaleTarget: dimensions.AutoScalingGroupName,
    };
  }

  if (alarmName.includes("-ec2-status")) {
    const resourceId = dimensions.InstanceId ?? alarmName.split("-").at(-1) ?? alarmName;
    return {
      kind: "EC2_STATUS_CHECK_FAILED",
      eventId,
      observedAt,
      receiveCount,
      resourceId,
      resourceType: "EC2",
      trigger: `CloudWatch alarm ${alarmName}`,
      environment: "development",
      autoRecover: true,
    };
  }

  if (alarmName.includes("-sqs-backlog")) {
    const resourceId = dimensions.QueueName ?? alarmName;
    return {
      kind: "QUEUE_BACKLOG",
      eventId,
      observedAt,
      receiveCount,
      resourceId,
      resourceType: "SQS",
      trigger: `CloudWatch alarm ${alarmName}`,
      depth: threshold + 1,
      threshold,
      scaleTarget: dimensions.AutoScalingGroupName,
    };
  }

  return {
    kind: "UNKNOWN",
    eventId,
    observedAt,
    receiveCount,
    resourceId: alarmName,
    resourceType: "UNKNOWN",
    trigger: `CloudWatch alarm ${alarmName}`,
    rawType: alarmName,
  };
}

function parseConfig(body: Record<string, unknown>, receiveCount: number): NormalizedSignal | null {
  const detail = recordField(body, "detail");
  if (!detail) throw new Error("Config event is missing detail");
  const evaluation = recordField(detail, "newEvaluationResult");
  if (stringField(evaluation, "complianceType") !== "NON_COMPLIANT") return null;

  const rule = requiredString(detail, "configRuleName");
  const resourceId = requiredString(detail, "resourceId");
  const eventId = requiredString(body, "id");
  const observedAt = stringField(body, "time") ?? new Date().toISOString();
  const base = {
    eventId,
    observedAt,
    receiveCount,
    resourceId,
    trigger: `Config rule ${rule} is NON_COMPLIANT`,
  };

  if (rule.includes("S3_BUCKET_PUBLIC") || rule.includes("sentinelops-s3-public")) {
    return { ...base, kind: "S3_PUBLIC", resourceType: "S3", publicAccess: true };
  }
  if (rule.includes("SSH") || rule.includes("sentinelops-ssh")) {
    return {
      ...base,
      kind: "SG_PUBLIC_SSH",
      resourceType: "SECURITY_GROUP",
      port: 22,
      cidr: "0.0.0.0/0",
    };
  }

  return {
    ...base,
    kind: "UNKNOWN",
    resourceType: "UNKNOWN",
    rawType: rule,
  };
}

function baseFrom(
  body: Record<string, unknown>,
  detail: Record<string, unknown>,
  receiveCount: number,
  resourceType: ResourceType,
): Omit<NormalizedSignal, "kind"> & { resourceType: ResourceType } {
  const environment = stringField(detail, "environment");
  return {
    eventId: stringField(body, "id") ?? requiredString(detail, "eventId"),
    observedAt: stringField(body, "time") ?? new Date().toISOString(),
    receiveCount,
    resourceId: requiredString(detail, "resourceId"),
    resourceType,
    trigger: requiredString(detail, "trigger"),
    environment: isEnvironment(environment) ? environment : undefined,
    autoRecover: detail.autoRecover === true,
    scaleTarget: stringField(detail, "scaleTarget"),
  };
}

function readDimensions(configuration: Record<string, unknown>): Record<string, string> {
  const metrics = configuration.metrics;
  if (!Array.isArray(metrics)) return {};
  const first = metrics[0];
  if (!isRecord(first)) return {};
  const metricStat = recordField(first, "metricStat");
  const metric = recordField(metricStat, "metric");
  const dimensions = metric?.dimensions;
  if (!isRecord(dimensions)) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(dimensions)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

function isEnvironment(value: string | undefined): value is EnvironmentName {
  return value === "development" || value === "production" || value === "test";
}

function requiredString(record: Record<string, unknown> | undefined, key: string): string {
  const value = stringField(record, key);
  if (!value) throw new Error(`Event is missing ${key}`);
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number") throw new Error(`Event is missing numeric ${key}`);
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`Event is missing boolean ${key}`);
  return value;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function recordField(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
