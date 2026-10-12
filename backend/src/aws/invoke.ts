import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { Incident, RemediationAction, RemediationResult, VerificationResult } from "../domain/types.js";
import type { Remediator } from "../remediation/types.js";
import type { Verifier } from "../verification/types.js";

const FUNCTION_ENV: Record<RemediationAction, string | null> = {
  SCALE_OR_RECOVER: "REMEDIATE_EC2_FUNCTION",
  RECOVER_INSTANCE: "REMEDIATE_EC2_FUNCTION",
  BLOCK_PUBLIC_ACCESS: "REMEDIATE_S3_FUNCTION",
  REMOVE_PUBLIC_SSH_RULE: "REMEDIATE_SG_FUNCTION",
  SCALE_PROCESSING: "REMEDIATE_QUEUE_FUNCTION",
  ALERT_ONLY: null,
};

export class InvokingRemediator implements Remediator {
  constructor(private readonly lambda: LambdaClient) {}

  async execute(incident: Incident): Promise<RemediationResult> {
    const envName = FUNCTION_ENV[incident.remediationAction];
    if (!envName) {
      throw new Error(`No remediation function for ${incident.remediationAction}`);
    }
    const functionName = process.env[envName];
    if (!functionName) throw new Error(`Missing environment variable ${envName}`);
    return invoke<RemediationResult>(this.lambda, functionName, incident);
  }
}

export class InvokingVerifier implements Verifier {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly functionName: string,
  ) {}

  async verify(incident: Incident): Promise<VerificationResult> {
    return invoke<VerificationResult>(this.lambda, this.functionName, incident);
  }
}

async function invoke<T>(lambda: LambdaClient, functionName: string, payload: unknown): Promise<T> {
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  const raw = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
  if (response.FunctionError) {
    throw new Error(raw || response.FunctionError);
  }
  if (!raw) throw new Error(`Empty response from ${functionName}`);
  return JSON.parse(raw) as T;
}
