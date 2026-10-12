import { awsClients } from "../aws/runtime.js";
import { removePublicSsh } from "../remediation/aws.js";
import { readIncidentPayload } from "./http.js";

const { ec2 } = awsClients();

export async function handler(event: unknown) {
  return removePublicSsh(ec2, readIncidentPayload(event));
}
