import type { Incident } from "../domain/types.js";
import { DuplicateEventError } from "./errors.js";
import type { IncidentRepository } from "./types.js";

export class MemoryIncidentStore implements IncidentRepository {
  private readonly incidents = new Map<string, Incident>();
  private readonly byEvent = new Map<string, string>();

  async findByEventId(eventId: string): Promise<Incident | null> {
    const incidentId = this.byEvent.get(eventId);
    if (!incidentId) return null;
    return this.get(incidentId);
  }

  async get(incidentId: string): Promise<Incident | null> {
    const incident = this.incidents.get(incidentId);
    return incident ? structuredClone(incident) : null;
  }

  async insert(incident: Incident): Promise<void> {
    if (this.byEvent.has(incident.eventId) || this.incidents.has(incident.incidentId)) {
      throw new DuplicateEventError(incident.eventId);
    }
    this.incidents.set(incident.incidentId, structuredClone(incident));
    this.byEvent.set(incident.eventId, incident.incidentId);
  }

  async save(incident: Incident): Promise<void> {
    if (!this.incidents.has(incident.incidentId)) {
      throw new Error(`Incident ${incident.incidentId} does not exist`);
    }
    this.incidents.set(incident.incidentId, structuredClone(incident));
    this.byEvent.set(incident.eventId, incident.incidentId);
  }

  async list(): Promise<Incident[]> {
    return [...this.incidents.values()]
      .map((incident) => structuredClone(incident))
      .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));
  }
}
