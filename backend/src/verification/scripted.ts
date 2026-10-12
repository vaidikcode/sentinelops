import type { Incident, VerificationResult } from "../domain/types.js";
import type { Verifier } from "./types.js";

export class ScriptedVerifier implements Verifier {
  failWith: string | null = null;
  readonly calls: string[] = [];

  async verify(incident: Incident): Promise<VerificationResult> {
    this.calls.push(incident.incidentId);
    if (this.failWith) {
      return {
        ok: false,
        detail: this.failWith,
        at: new Date().toISOString(),
      };
    }
    return {
      ok: true,
      detail: `${incident.resourceType} ${incident.resourceId} matches the expected safe state`,
      at: new Date().toISOString(),
    };
  }
}
