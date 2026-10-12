import { routeApi } from "../api/routes.js";
import { requireEnv } from "../aws/runtime.js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoIncidentStore } from "../store/dynamo-store.js";
import { jsonResult, type HttpApiEvent, type HttpApiResult } from "./http.js";

const store = new DynamoIncidentStore(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" }),
  requireEnv("INCIDENTS_TABLE"),
  requireEnv("EVENTS_TABLE"),
);

export async function handler(event: HttpApiEvent): Promise<HttpApiResult> {
  const method = event.requestContext?.http?.method ?? "GET";
  if (method === "OPTIONS") {
    return jsonResult(204, {});
  }
  let body: unknown;
  if (event.body) {
    try {
      body = JSON.parse(event.body) as unknown;
    } catch {
      return jsonResult(400, { error: "Invalid JSON" });
    }
  }
  const result = await routeApi(method, event.rawPath ?? "/", body, {
    store,
    allowSimulate: false,
  });
  return jsonResult(result.status, result.body);
}
