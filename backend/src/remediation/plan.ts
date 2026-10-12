import type { IpPermission } from "@aws-sdk/client-ec2";
import type { PublicAccessBlockConfiguration } from "@aws-sdk/client-s3";

export function publicAccessBlockConfiguration(): PublicAccessBlockConfiguration {
  return {
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: true,
    RestrictPublicBuckets: true,
  };
}

export function isPublicAccessBlocked(config: PublicAccessBlockConfiguration | undefined): boolean {
  if (!config) return false;
  return Boolean(
    config.BlockPublicAcls &&
      config.IgnorePublicAcls &&
      config.BlockPublicPolicy &&
      config.RestrictPublicBuckets,
  );
}

export function publicSshRevocations(permissions: IpPermission[]): IpPermission[] {
  const revocations: IpPermission[] = [];
  for (const permission of permissions) {
    if (permission.IpProtocol !== "tcp" || permission.FromPort !== 22 || permission.ToPort !== 22) {
      continue;
    }
    const ipRanges = (permission.IpRanges ?? []).filter((range) => range.CidrIp === "0.0.0.0/0");
    const ipv6Ranges = (permission.Ipv6Ranges ?? []).filter((range) => range.CidrIpv6 === "::/0");
    if (ipRanges.length === 0 && ipv6Ranges.length === 0) continue;
    revocations.push({
      IpProtocol: "tcp",
      FromPort: 22,
      ToPort: 22,
      IpRanges: ipRanges,
      Ipv6Ranges: ipv6Ranges,
    });
  }
  return revocations;
}

export function nextDesiredCapacity(current: number, max: number): number {
  if (current >= max) {
    throw new Error(`Desired capacity ${current} is already at max size ${max}`);
  }
  return current + 1;
}
