import {
  DescribeInstanceStatusCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import { GetMetricStatisticsCommand, CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { GetPublicAccessBlockCommand, S3Client } from "@aws-sdk/client-s3";
import { GetQueueAttributesCommand, GetQueueUrlCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { Incident, VerificationResult } from "../domain/types.js";
import { CPU_THRESHOLD_PERCENT } from "../classification/classify.js";
import { isPublicAccessBlocked, publicSshRevocations } from "../remediation/plan.js";

export interface VerifierClients {
  s3: S3Client;
  ec2: EC2Client;
  cloudwatch: CloudWatchClient;
  sqs: SQSClient;
}

export async function verifyIncident(
  clients: VerifierClients,
  incident: Incident,
): Promise<VerificationResult> {
  const at = new Date().toISOString();
  switch (incident.type) {
    case "PUBLIC_S3_BUCKET": {
      const response = await clients.s3.send(
        new GetPublicAccessBlockCommand({ Bucket: incident.resourceId }),
      );
      const ok = isPublicAccessBlocked(response.PublicAccessBlockConfiguration);
      return {
        ok,
        detail: ok
          ? "Public access block is enabled"
          : "Bucket public access block is still incomplete",
        at,
      };
    }
    case "DANGEROUS_SECURITY_GROUP": {
      const response = await clients.ec2.send(
        new DescribeSecurityGroupsCommand({ GroupIds: [incident.resourceId] }),
      );
      const open = publicSshRevocations(response.SecurityGroups?.[0]?.IpPermissions ?? []);
      const ok = open.length === 0;
      return {
        ok,
        detail: ok ? "Public SSH is closed" : "Public SSH rule is still present",
        at,
      };
    }
    case "EC2_UNHEALTHY": {
      const response = await clients.ec2.send(
        new DescribeInstanceStatusCommand({
          InstanceIds: [incident.resourceId],
          IncludeAllInstances: true,
        }),
      );
      const status = response.InstanceStatuses?.[0];
      const ok = status?.InstanceStatus?.Status === "ok" && status.SystemStatus?.Status === "ok";
      return {
        ok,
        detail: ok ? "Instance status checks are ok" : "Instance status checks are still failing",
        at,
      };
    }
    case "EC2_CPU_OVERLOAD": {
      const end = new Date();
      const start = new Date(end.getTime() - 5 * 60 * 1000);
      const response = await clients.cloudwatch.send(
        new GetMetricStatisticsCommand({
          Namespace: "AWS/EC2",
          MetricName: "CPUUtilization",
          Dimensions: [{ Name: "InstanceId", Value: incident.resourceId }],
          StartTime: start,
          EndTime: end,
          Period: 300,
          Statistics: ["Average"],
        }),
      );
      const average = response.Datapoints?.[0]?.Average;
      const ok = average !== undefined && average <= CPU_THRESHOLD_PERCENT;
      return {
        ok,
        detail:
          average === undefined
            ? "CPU metric is not available yet"
            : `CPU average is ${average.toFixed(1)}%`,
        at,
      };
    }
    case "SQS_QUEUE_BACKLOG": {
      const queueUrl = await resolveQueueUrl(clients.sqs, incident.resourceId);
      const response = await clients.sqs.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["ApproximateNumberOfMessages"],
        }),
      );
      const depth = Number(response.Attributes?.ApproximateNumberOfMessages ?? "NaN");
      const threshold = Number(incident.context.threshold ?? "100");
      const ok = Number.isFinite(depth) && depth <= threshold;
      return {
        ok,
        detail: Number.isFinite(depth)
          ? `Queue depth is ${depth}; threshold is ${threshold}`
          : "Queue depth is unavailable",
        at,
      };
    }
    case "UNKNOWN":
      return { ok: false, detail: "Unknown incidents are not verified automatically", at };
  }
}

async function resolveQueueUrl(sqs: SQSClient, resourceId: string): Promise<string> {
  if (resourceId.startsWith("https://")) return resourceId;
  const response = await sqs.send(new GetQueueUrlCommand({ QueueName: resourceId }));
  if (!response.QueueUrl) {
    throw new Error(`Queue URL not found for ${resourceId}`);
  }
  return response.QueueUrl;
}
