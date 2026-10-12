import type { Incident } from "../domain/types.js";

export interface Notifier {
  notify(incident: Incident): Promise<void>;
}
