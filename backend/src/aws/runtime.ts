import { AutoScalingClient } from "@aws-sdk/client-auto-scaling";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { EC2Client } from "@aws-sdk/client-ec2";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { SNSClient } from "@aws-sdk/client-sns";
import { SQSClient } from "@aws-sdk/client-sqs";
import { S3Archiver } from "../archive/s3.js";
import { InvokingRemediator, InvokingVerifier } from "./invoke.js";
import { SnsNotifier } from "../notifications/sns.js";
import type { PipelineDeps } from "../pipeline/handle-signal.js";
import { DynamoIncidentStore } from "../store/dynamo-store.js";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function awsClients(region = process.env.AWS_REGION ?? "us-east-1") {
  return {
    dynamo: new DynamoDBClient({ region }),
    lambda: new LambdaClient({ region }),
    s3: new S3Client({ region }),
    ec2: new EC2Client({ region }),
    autoscaling: new AutoScalingClient({ region }),
    cloudwatch: new CloudWatchClient({ region }),
    sqs: new SQSClient({ region }),
    sns: new SNSClient({ region }),
  };
}

export function processorDeps(): PipelineDeps {
  const clients = awsClients();
  let sequence = 0;
  return {
    store: new DynamoIncidentStore(clients.dynamo, requireEnv("INCIDENTS_TABLE"), requireEnv("EVENTS_TABLE")),
    remediator: new InvokingRemediator(clients.lambda),
    verifier: new InvokingVerifier(clients.lambda, requireEnv("VERIFY_FUNCTION")),
    notifier: new SnsNotifier(clients.sns, requireEnv("SNS_TOPIC_ARN")),
    archiver: new S3Archiver(clients.s3, requireEnv("AUDIT_BUCKET")),
    now: () => new Date().toISOString(),
    createId: () => {
      sequence += 1;
      const now = new Date();
      const entropy = `${now.getTime().toString(36)}${sequence.toString(36)}`.toUpperCase();
      return `INC-${now.getUTCFullYear()}-${entropy}`;
    },
  };
}
