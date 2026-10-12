import { awsClients } from "../aws/runtime.js";
import { recoverInstance, scaleForCpu } from "../remediation/aws.js";
import { readIncidentPayload } from "./http.js";

const { ec2, autoscaling } = awsClients();

export async function handler(event: unknown) {
  const incident = readIncidentPayload(event);
  if (incident.remediationAction === "RECOVER_INSTANCE") {
    return recoverInstance(ec2, incident);
  }
  return scaleForCpu(autoscaling, incident);
}
