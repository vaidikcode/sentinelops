import type { IncidentRepository } from "../store/types.js";
import type { ScenarioName, ScenarioOutcome } from "../local/scenarios.js";
import { isScenarioName, runScenario } from "../local/scenarios.js";
import { resourceHealth, summarize, type ApiResult } from "./summary.js";
import { MemoryIncidentStore } from "../store/memory-store.js";

export interface RouteDeps {
  store: IncidentRepository;
  allowSimulate: boolean;
}

export async function routeApi(method: string, path: string, body: unknown, deps: RouteDeps): Promise<ApiResult> {
  const normalized = normalize(path);

  if (method === "GET" && normalized === "/health") {
    return { status: 200, body: { ok: true } };
  }

  if (method === "GET" && normalized === "/summary") {
    const incidents = await deps.store.list();
    return { status: 200, body: summarize(incidents) };
  }

  if (method === "GET" && normalized === "/incidents") {
    return { status: 200, body: { incidents: await deps.store.list() } };
  }

  if (method === "GET" && normalized === "/resources") {
    return { status: 200, body: { resources: resourceHealth(await deps.store.list()) } };
  }

  if (method === "GET" && normalized.startsWith("/incidents/")) {
    const incidentId = decodeURIComponent(normalized.slice("/incidents/".length));
    const incident = await deps.store.get(incidentId);
    if (!incident) return { status: 404, body: { error: "Incident not found" } };
    return { status: 200, body: incident };
  }

  if (method === "POST" && normalized === "/simulate") {
    if (!deps.allowSimulate) {
      return { status: 404, body: { error: "Not found" } };
    }
    if (!(deps.store instanceof MemoryIncidentStore)) {
      return { status: 400, body: { error: "Simulation is only available in the local runtime" } };
    }
    const scenario = isRecord(body) ? body.scenario : undefined;
    if (typeof scenario !== "string" || !isScenarioName(scenario)) {
      return { status: 400, body: { error: "Unknown scenario" } };
    }
    const outcome = await runScenario(scenario, deps.store);
    return { status: 200, body: outcome };
  }

  return { status: 404, body: { error: "Not found" } };
}

function normalize(path: string): string {
  const withoutQuery = path.split("?")[0] ?? "/";
  const stripped = withoutQuery.replace(/\/+$/, "") || "/";
  return stripped.startsWith("/api/") ? stripped.slice(4) : stripped === "/api" ? "/" : stripped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type { ScenarioName, ScenarioOutcome };
