import type { Incident } from "../domain/types.js";

export interface Verifier {
  verify(incident: Incident): Promise<import("../domain/types.js").VerificationResult>;
}
