import type { Incident } from "../domain/types.js";

export interface IncidentRepository {
  findByEventId(eventId: string): Promise<Incident | null>;
  get(incidentId: string): Promise<Incident | null>;
  insert(incident: Incident): Promise<void>;
  save(incident: Incident): Promise<void>;
  list(): Promise<Incident[]>;
}
