import type { Incident, IncidentStatus, IncidentType, NormalizedSignal, Severity } from "./types.js";
import type { RemediationAction } from "./types.js";

export function appendTimeline(
  incident: Incident,
  message: string,
  status: IncidentStatus,
  at: string,
): Incident {
  return {
    ...incident,
    status,
    timeline: [...incident.timeline, { at, status, message }],
  };
}

export function contextFromSignal(signal: NormalizedSignal): Record<string, string> {
  const context: Record<string, string> = {};
  if (signal.scaleTarget) context.scaleTarget = signal.scaleTarget;
  if (signal.environment) context.environment = signal.environment;
  if (signal.autoRecover) context.autoRecover = "true";

  switch (signal.kind) {
    case "CPU_HIGH":
      context.cpuPercent = String(signal.cpuPercent);
      context.durationMinutes = String(signal.durationMinutes);
      break;
    case "QUEUE_BACKLOG":
      context.depth = String(signal.depth);
      context.threshold = String(signal.threshold);
      break;
    case "SG_PUBLIC_SSH":
      context.port = String(signal.port);
      context.cidr = signal.cidr;
      break;
    case "S3_PUBLIC":
      context.publicAccess = String(signal.publicAccess);
      break;
    case "UNKNOWN":
      context.rawType = signal.rawType;
      break;
    case "EC2_STATUS_CHECK_FAILED":
      break;
  }

  return context;
}

export function createIncident(input: {
  incidentId: string;
  signal: NormalizedSignal;
  type: IncidentType;
  severity: Severity;
  action: RemediationAction;
  now: string;
}): Incident {
  return {
    incidentId: input.incidentId,
    eventId: input.signal.eventId,
    type: input.type,
    resourceId: input.signal.resourceId,
    resourceType: input.signal.resourceType,
    severity: input.severity,
    detectedAt: input.signal.observedAt || input.now,
    status: "DETECTED",
    trigger: input.signal.trigger,
    remediationAction: input.action,
    attempts: 0,
    environment: input.signal.environment,
    context: contextFromSignal(input.signal),
    timeline: [],
  };
}
