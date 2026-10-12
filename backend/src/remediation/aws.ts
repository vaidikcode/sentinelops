import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SetDesiredCapacityCommand,
} from "@aws-sdk/client-auto-scaling";
import {
  DescribeSecurityGroupsCommand,
  EC2Client,
  RebootInstancesCommand,
  RevokeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";
import {
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Incident, RemediationAction, RemediationResult } from "../domain/types.js";
import { nextDesiredCapacity, publicAccessBlockConfiguration, publicSshRevocations } from "./plan.js";

export function assertAction(incident: Incident, allowed: readonly RemediationAction[]): void {
  if (!allowed.includes(incident.remediationAction)) {
    throw new Error(
      `Refusing ${incident.remediationAction}; this function only performs ${allowed.join(", ")}`,
    );
  }
}

export async function blockPublicAccess(s3: S3Client, incident: Incident): Promise<RemediationResult> {
  assertAction(incident, ["BLOCK_PUBLIC_ACCESS"]);
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: incident.resourceId,
      PublicAccessBlockConfiguration: publicAccessBlockConfiguration(),
    }),
  );
  return {
    ok: true,
    summary: `Public access blocked on ${incident.resourceId}`,
    at: new Date().toISOString(),
  };
}

export async function recoverInstance(ec2: EC2Client, incident: Incident): Promise<RemediationResult> {
  assertAction(incident, ["RECOVER_INSTANCE"]);
  await ec2.send(new RebootInstancesCommand({ InstanceIds: [incident.resourceId] }));
  return {
    ok: true,
    summary: `Reboot requested for ${incident.resourceId}`,
    at: new Date().toISOString(),
  };
}

export async function scaleForCpu(
  autoscaling: AutoScalingClient,
  incident: Incident,
): Promise<RemediationResult> {
  assertAction(incident, ["SCALE_OR_RECOVER"]);
  return scaleGroup(autoscaling, incident, incident.context.scaleTarget);
}

export async function scaleProcessing(
  autoscaling: AutoScalingClient,
  incident: Incident,
): Promise<RemediationResult> {
  assertAction(incident, ["SCALE_PROCESSING"]);
  return scaleGroup(autoscaling, incident, incident.context.scaleTarget);
}

export async function removePublicSsh(ec2: EC2Client, incident: Incident): Promise<RemediationResult> {
  assertAction(incident, ["REMOVE_PUBLIC_SSH_RULE"]);
  const described = await ec2.send(
    new DescribeSecurityGroupsCommand({ GroupIds: [incident.resourceId] }),
  );
  const permissions = described.SecurityGroups?.[0]?.IpPermissions ?? [];
  const revocations = publicSshRevocations(permissions);
  if (revocations.length === 0) {
    return {
      ok: true,
      summary: `Public SSH rule already absent on ${incident.resourceId}`,
      at: new Date().toISOString(),
    };
  }
  await ec2.send(
    new RevokeSecurityGroupIngressCommand({
      GroupId: incident.resourceId,
      IpPermissions: revocations,
    }),
  );
  return {
    ok: true,
    summary: `Removed public SSH from ${incident.resourceId}`,
    at: new Date().toISOString(),
  };
}

async function scaleGroup(
  autoscaling: AutoScalingClient,
  incident: Incident,
  groupName: string | undefined,
): Promise<RemediationResult> {
  if (!groupName) {
    return {
      ok: false,
      approvalRequired: true,
      summary: "No approved Auto Scaling target is attached to this incident",
      at: new Date().toISOString(),
    };
  }

  const described = await autoscaling.send(
    new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [groupName] }),
  );
  const group = described.AutoScalingGroups?.[0];
  if (!group) {
    throw new Error(`Auto Scaling group ${groupName} was not found`);
  }

  const current = group.DesiredCapacity ?? 0;
  const max = group.MaxSize ?? current;
  let next: number;
  try {
    next = nextDesiredCapacity(current, max);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Already at max capacity";
    return {
      ok: false,
      approvalRequired: true,
      summary: message,
      at: new Date().toISOString(),
    };
  }

  await autoscaling.send(
    new SetDesiredCapacityCommand({
      AutoScalingGroupName: groupName,
      DesiredCapacity: next,
      HonorCooldown: false,
    }),
  );

  return {
    ok: true,
    summary: `Raised ${groupName} desired capacity from ${current} to ${next} for ${incident.resourceId}`,
    at: new Date().toISOString(),
  };
}
