import { ACTION_LABELS, INCIDENT_LABELS, type Incident } from "../domain/types.js";

export function formatAlert(incident: Incident): string {
  const lines = [
    `${incident.severity} INCIDENT`,
    INCIDENT_LABELS[incident.type],
    "",
    `Incident: ${incident.incidentId}`,
    `Resource: ${incident.resourceId}`,
    `Action: ${ACTION_LABELS[incident.remediationAction]}`,
    `Status: ${incident.status}`,
  ];

  if (incident.remediationResult) {
    lines.push(`Result: ${incident.remediationResult.summary}`);
  }
  if (incident.errorDetails) {
    lines.push(`Error: ${incident.errorDetails}`);
  }

  return lines.join("\n");
}
