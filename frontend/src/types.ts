export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type IncidentStatus =
  | "DETECTED"
  | "CLASSIFIED"
  | "REMEDIATION_PENDING"
  | "REMEDIATING"
  | "VERIFYING"
  | "RESOLVED"
  | "FAILED"
  | "REQUIRES_APPROVAL"
  | "REQUIRES_ATTENTION";

export interface TimelineEntry {
  at: string;
  status: IncidentStatus;
  message: string;
}

export interface Incident {
  incidentId: string;
  eventId: string;
  type: string;
  resourceId: string;
  resourceType: string;
  severity: Severity;
  detectedAt: string;
  status: IncidentStatus;
  trigger: string;
  remediationAction: string;
  remediationResult?: { ok: boolean; summary: string };
  verificationResult?: { ok: boolean; detail: string };
  resolvedAt?: string;
  errorDetails?: string;
  attempts: number;
  timeline: TimelineEntry[];
}

export interface Summary {
  total: number;
  open: number;
  critical: number;
  autoRemediated: number;
  failed: number;
}

export interface ResourceHealth {
  resourceId: string;
  resourceType: string;
  status: "healthy" | "incident";
  openIncidents: number;
  lastIncidentType?: string;
}

export interface ScenarioOutcome {
  scenario: string;
  notes: string[];
  incidents: Incident[];
}

export const SCENARIOS = [
  ["public-s3", "Public S3"],
  ["unhealthy-ec2", "Unhealthy EC2"],
  ["cpu-overload", "CPU overload"],
  ["open-ssh", "Open SSH"],
  ["queue-backlog", "Queue backlog"],
  ["duplicate", "Duplicate event"],
  ["remediation-failure", "Remediation failure"],
  ["verification-failure", "Verification failure"],
  ["unknown", "Unknown"],
] as const;
