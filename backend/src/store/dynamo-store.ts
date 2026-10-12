import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { INCIDENT_STATUSES, type Incident, type IncidentStatus } from "../domain/types.js";
import { DuplicateEventError } from "./errors.js";
import type { IncidentRepository } from "./types.js";

interface IncidentItem {
  incidentId: string;
  eventId: string;
  status: IncidentStatus;
  detectedAt: string;
  severity: string;
  payload: Incident;
}

export class DynamoIncidentStore implements IncidentRepository {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    client: DynamoDBClient,
    private readonly incidentsTable: string,
    private readonly eventsTable: string,
  ) {
    this.doc = DynamoDBDocumentClient.from(client);
  }

  async findByEventId(eventId: string): Promise<Incident | null> {
    const pointer = await this.doc.send(
      new GetCommand({
        TableName: this.eventsTable,
        Key: { eventId },
      }),
    );
    const incidentId = pointer.Item?.incidentId;
    if (typeof incidentId !== "string") return null;
    return this.get(incidentId);
  }

  async get(incidentId: string): Promise<Incident | null> {
    const response = await this.doc.send(
      new GetCommand({
        TableName: this.incidentsTable,
        Key: { incidentId },
      }),
    );
    return response.Item ? readIncident(response.Item) : null;
  }

  async insert(incident: Incident): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.eventsTable,
                Item: { eventId: incident.eventId, incidentId: incident.incidentId },
                ConditionExpression: "attribute_not_exists(eventId)",
              },
            },
            {
              Put: {
                TableName: this.incidentsTable,
                Item: toItem(incident),
                ConditionExpression: "attribute_not_exists(incidentId)",
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new DuplicateEventError(incident.eventId);
      }
      throw error;
    }
  }

  async save(incident: Incident): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.incidentsTable,
        Item: toItem(incident),
        ConditionExpression: "attribute_exists(incidentId)",
      }),
    );
  }

  async list(): Promise<Incident[]> {
    const pages = await Promise.all(INCIDENT_STATUSES.map((status) => this.queryStatus(status)));
    return pages
      .flat()
      .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
  }

  private async queryStatus(status: IncidentStatus): Promise<Incident[]> {
    const incidents: Incident[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const response = await this.doc.send(
        new QueryCommand({
          TableName: this.incidentsTable,
          IndexName: "by_status",
          KeyConditionExpression: "#status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": status },
          ScanIndexForward: false,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const item of response.Items ?? []) {
        incidents.push(readIncident(item));
      }
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return incidents;
  }
}

function toItem(incident: Incident): IncidentItem {
  return {
    incidentId: incident.incidentId,
    eventId: incident.eventId,
    status: incident.status,
    detectedAt: incident.detectedAt,
    severity: incident.severity,
    payload: incident,
  };
}

function readIncident(item: Record<string, unknown>): Incident {
  const payload = item.payload;
  if (!payload || typeof payload !== "object") {
    throw new Error(`Incident ${String(item.incidentId)} is missing its payload`);
  }
  return payload as Incident;
}

function isConditionalFailure(error: unknown): boolean {
  if (!(error instanceof TransactionCanceledException)) return false;
  return (error.CancellationReasons ?? []).some((reason) => reason.Code === "ConditionalCheckFailed");
}
