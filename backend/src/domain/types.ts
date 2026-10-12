export const INCIDENT_TYPES = [
  "EC2_CPU_OVERLOAD",
  "EC2_UNHEALTHY",
  "PUBLIC_S3_BUCKET",
  "DANGEROUS_SECURITY_GROUP",
  "SQS_QUEUE_BACKLOG",
  "UNKNOWN",
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  "DETECTED",
  "CLASSIFIED",
  "REMEDIATION_PENDING",
  "REMEDIATING",
  "VERIFYING",
  "RESOLVED",
  "FAILED",
  "REQUIRES_APPROVAL",
  "REQUIRES_ATTENTION",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const REMEDIATION_ACTIONS = [
  "SCALE_OR_RECOVER",
  "RECOVER_INSTANCE",
  "BLOCK_PUBLIC_ACCESS",
  "REMOVE_PUBLIC_SSH_RULE",
  "SCALE_PROCESSING",
  "ALERT_ONLY",
] as const;

export type RemediationAction = (typeof REMEDIATION_ACTIONS)[number];

export const RESOURCE_TYPES = ["EC2", "S3", "SQS", "SECURITY_GROUP", "UNKNOWN"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type EnvironmentName = "development" | "production" | "test";

export interface TimelineEntry {
  at: string;
  status: IncidentStatus;
  message: string;
}

export interface RemediationResult {
  ok: boolean;
  summary: string;
  approvalRequired?: boolean;
  at: string;
}

export interface VerificationResult {
  ok: boolean;
  detail: string;
  at: string;
}

export interface Incident {
  incidentId: string;
  eventId: string;
  type: IncidentType;
  resourceId: string;
  resourceType: ResourceType;
  severity: Severity;
  detectedAt: string;
  status: IncidentStatus;
  trigger: string;
  remediationAction: RemediationAction;
  remediationResult?: RemediationResult;
  verificationResult?: VerificationResult;
  resolvedAt?: string;
  errorDetails?: string;
  attempts: number;
  environment?: EnvironmentName;
  context: Record<string, string>;
  timeline: TimelineEntry[];
}

export type SignalKind =
  | "CPU_HIGH"
  | "EC2_STATUS_CHECK_FAILED"
  | "S3_PUBLIC"
  | "SG_PUBLIC_SSH"
  | "QUEUE_BACKLOG"
  | "UNKNOWN";

interface SignalBase {
  eventId: string;
  observedAt: string;
  receiveCount: number;
  resourceId: string;
  resourceType: ResourceType;
  trigger: string;
  environment?: EnvironmentName;
  autoRecover?: boolean;
  scaleTarget?: string;
}

export type NormalizedSignal = SignalBase &
  (
    | { kind: "CPU_HIGH"; cpuPercent: number; durationMinutes: number }
    | { kind: "EC2_STATUS_CHECK_FAILED" }
    | { kind: "S3_PUBLIC"; publicAccess: boolean }
    | { kind: "SG_PUBLIC_SSH"; port: number; cidr: string }
    | { kind: "QUEUE_BACKLOG"; depth: number; threshold: number }
    | { kind: "UNKNOWN"; rawType: string }
  );

export const INCIDENT_LABELS: Record<IncidentType, string> = {
  EC2_CPU_OVERLOAD: "EC2 CPU overload",
  EC2_UNHEALTHY: "EC2 instance unhealthy",
  PUBLIC_S3_BUCKET: "Public S3 bucket",
  DANGEROUS_SECURITY_GROUP: "Dangerous security group",
  SQS_QUEUE_BACKLOG: "SQS queue backlog",
  UNKNOWN: "Unknown incident",
};

export const ACTION_LABELS: Record<RemediationAction, string> = {
  SCALE_OR_RECOVER: "Scale or recover",
  RECOVER_INSTANCE: "Recover instance",
  BLOCK_PUBLIC_ACCESS: "Block public access",
  REMOVE_PUBLIC_SSH_RULE: "Remove public SSH rule",
  SCALE_PROCESSING: "Scale processing",
  ALERT_ONLY: "Alert only",
};
