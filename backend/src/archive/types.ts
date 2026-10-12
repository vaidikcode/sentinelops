import type { Incident } from "../domain/types.js";

export interface Archiver {
  archive(incident: Incident): Promise<void>;
}
