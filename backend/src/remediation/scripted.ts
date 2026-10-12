import type { Incident, RemediationResult } from "../domain/types.js";
import type { Remediator } from "./types.js";

export class ScriptedRemediator implements Remediator {
  readonly calls: Incident[] = [];
  failuresRemaining = 0;
  failureMessage = "AWS remediation API failed";

  async execute(incident: Incident): Promise<RemediationResult> {
    this.calls.push(structuredClone(incident));
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error(this.failureMessage);
    }
    return {
      ok: true,
      summary: `${incident.remediationAction} completed for ${incident.resourceId}`,
      at: new Date().toISOString(),
    };
  }
}
