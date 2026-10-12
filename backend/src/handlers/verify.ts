import { awsClients } from "../aws/runtime.js";
import { verifyIncident } from "../verification/aws.js";
import { readIncidentPayload } from "./http.js";

const clients = awsClients();

export async function handler(event: unknown) {
  return verifyIncident(clients, readIncidentPayload(event));
}
