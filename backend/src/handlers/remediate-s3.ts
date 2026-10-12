import { awsClients } from "../aws/runtime.js";
import { blockPublicAccess } from "../remediation/aws.js";
import { readIncidentPayload } from "./http.js";

const { s3 } = awsClients();

export async function handler(event: unknown) {
  return blockPublicAccess(s3, readIncidentPayload(event));
}
