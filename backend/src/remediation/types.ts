import type { Incident } from "../domain/types.js";

export interface Remediator {
  execute(incident: Incident): Promise<import("../domain/types.js").RemediationResult>;
}
