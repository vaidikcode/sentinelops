import type { IncidentType, RemediationAction, Severity } from "../domain/types.js";

export type PolicyMode = "automatic" | "approval_required" | "alert_only";

export interface PolicyRule {
  incidentType: IncidentType;
  severity: Severity;
  action: RemediationAction;
  mode: PolicyMode;
  reason: string;
}

export interface DecisionInput {
  type: IncidentType;
  environment?: string;
  autoRecover?: boolean;
  hasScaleTarget?: boolean;
}

const RULES: Record<IncidentType, PolicyRule> = {
  EC2_CPU_OVERLOAD: {
    incidentType: "EC2_CPU_OVERLOAD",
    severity: "HIGH",
    action: "SCALE_OR_RECOVER",
    mode: "automatic",
    reason: "Approved scale-out for sustained high CPU",
  },
  EC2_UNHEALTHY: {
    incidentType: "EC2_UNHEALTHY",
    severity: "HIGH",
    action: "RECOVER_INSTANCE",
    mode: "automatic",
    reason: "Approved recovery for an unhealthy instance",
  },
  PUBLIC_S3_BUCKET: {
    incidentType: "PUBLIC_S3_BUCKET",
    severity: "CRITICAL",
    action: "BLOCK_PUBLIC_ACCESS",
    mode: "automatic",
    reason: "Approved block of public bucket access",
  },
  DANGEROUS_SECURITY_GROUP: {
    incidentType: "DANGEROUS_SECURITY_GROUP",
    severity: "CRITICAL",
    action: "REMOVE_PUBLIC_SSH_RULE",
    mode: "automatic",
    reason: "Approved removal of public SSH",
  },
  SQS_QUEUE_BACKLOG: {
    incidentType: "SQS_QUEUE_BACKLOG",
    severity: "MEDIUM",
    action: "SCALE_PROCESSING",
    mode: "automatic",
    reason: "Approved consumer scale-out for queue backlog",
  },
  UNKNOWN: {
    incidentType: "UNKNOWN",
    severity: "LOW",
    action: "ALERT_ONLY",
    mode: "alert_only",
    reason: "Unknown incidents are recorded and alerted, never remediated",
  },
};

export function policyFor(type: IncidentType): PolicyRule {
  return RULES[type];
}

export function decide(input: DecisionInput): PolicyRule {
  const base = RULES[input.type];

  if (input.type === "EC2_UNHEALTHY" && input.environment === "production" && !input.autoRecover) {
    return {
      ...base,
      mode: "approval_required",
      reason: "Production instance recovery requires explicit approval",
    };
  }

  if (
    (input.type === "EC2_CPU_OVERLOAD" || input.type === "SQS_QUEUE_BACKLOG") &&
    !input.hasScaleTarget
  ) {
    return {
      ...base,
      mode: "approval_required",
      reason: "No approved Auto Scaling target is attached to this incident",
    };
  }

  return base;
}

export const DESTRUCTIVE_ACTIONS = [
  "terminate-instance",
  "delete-bucket",
  "delete-security-group",
  "change-iam",
] as const;

export function isApprovedAutomaticAction(action: RemediationAction): boolean {
  return action !== "ALERT_ONLY";
}
