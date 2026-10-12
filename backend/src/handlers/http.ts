import type { Incident } from "../domain/types.js";

export function readIncidentPayload(event: unknown): Incident {
  if (!event || typeof event !== "object") {
    throw new Error("Invocation payload must be an incident");
  }
  const incident = event as Partial<Incident>;
  if (!incident.incidentId || !incident.remediationAction || !incident.resourceId || !incident.type) {
    throw new Error("Invocation payload is missing incident fields");
  }
  return event as Incident;
}

export interface SqsRecord {
  messageId: string;
  body: string;
  attributes?: { ApproximateReceiveCount?: string };
}

export interface SqsEvent {
  Records?: SqsRecord[];
}

export interface SqsBatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

export interface HttpApiEvent {
  rawPath?: string;
  body?: string | null;
  requestContext?: { http?: { method?: string } };
}

export interface HttpApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function jsonResult(statusCode: number, body: unknown): HttpApiResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
