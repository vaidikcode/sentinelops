import type { Incident, ResourceHealth, ScenarioOutcome, Summary } from "./types";

const remote = import.meta.env.VITE_API_URL as string | undefined;

function endpoint(path: string): string {
  if (remote) return `${remote.replace(/\/$/, "")}${path}`;
  return `/api${path}`;
}

function headers(): HeadersInit {
  const token = sessionStorage.getItem("sentinelops_token");
  return token
    ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
    : { "content-type": "application/json" };
}

async function read<T>(path: string): Promise<T> {
  const response = await fetch(endpoint(path), { headers: headers() });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchSummary(): Promise<Summary> {
  return read<Summary>("/summary");
}

export function fetchIncidents(): Promise<Incident[]> {
  return read<{ incidents: Incident[] }>("/incidents").then((body) => body.incidents);
}

export function fetchResources(): Promise<ResourceHealth[]> {
  return read<{ resources: ResourceHealth[] }>("/resources").then((body) => body.resources);
}

export async function runScenario(scenario: string): Promise<ScenarioOutcome> {
  const response = await fetch(endpoint("/simulate"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ scenario }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Scenario failed (${response.status})`);
  }
  return (await response.json()) as ScenarioOutcome;
}
