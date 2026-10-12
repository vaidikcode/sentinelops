import { awsClients } from "../aws/runtime.js";
import { scaleProcessing } from "../remediation/aws.js";
import { readIncidentPayload } from "./http.js";

const { autoscaling } = awsClients();

export async function handler(event: unknown) {
  return scaleProcessing(autoscaling, readIncidentPayload(event));
}
