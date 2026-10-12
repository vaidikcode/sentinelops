import type { Incident, IncidentType, ResourceType } from "../domain/types.js";

export interface Summary {
  total: number;
  open: number;
  critical: number;
  autoRemediated: number;
  failed: number;
}

export interface ResourceHealth {
  resourceId: string;
  resourceType: ResourceType;
  status: "healthy" | "incident";
  openIncidents: number;
  lastIncidentType?: IncidentType;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

export function summarize(incidents: Incident[]): Summary {
  return {
    total: incidents.length,
    open: incidents.filter((incident) => incident.status !== "RESOLVED").length,
    critical: incidents.filter(
      (incident) => incident.severity === "CRITICAL" && incident.status !== "RESOLVED",
    ).length,
    autoRemediated: incidents.filter(
      (incident) => incident.status === "RESOLVED" && incident.remediationResult?.ok === true,
    ).length,
    failed: incidents.filter(
      (incident) => incident.status === "FAILED" || incident.status === "REQUIRES_ATTENTION",
    ).length,
  };
}

export function resourceHealth(incidents: Incident[]): ResourceHealth[] {
  const grouped = new Map<string, Incident[]>();
  for (const incident of incidents) {
    const current = grouped.get(incident.resourceId) ?? [];
    current.push(incident);
    grouped.set(incident.resourceId, current);
  }

  return [...grouped.entries()]
    .map(([resourceId, group]) => {
      const open = group.filter((incident) => incident.status !== "RESOLVED");
      const latest = [...group].sort((left, right) => right.detectedAt.localeCompare(left.detectedAt))[0];
      return {
        resourceId,
        resourceType: latest?.resourceType ?? "UNKNOWN",
        status: open.length > 0 ? ("incident" as const) : ("healthy" as const),
        openIncidents: open.length,
        lastIncidentType: latest?.type,
      };
    })
    .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
}
