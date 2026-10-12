# Unhealthy EC2 instance

## Detection

CloudWatch alarm `sentinelops-ec2-status-<instance-id>` on `StatusCheckFailed`, or a direct `EC2_STATUS_CHECK_FAILED` event.

## Severity

HIGH. Action: `RECOVER_INSTANCE` (reboot).

## Automatic action

Development instances are rebooted. Production instances are rebooted only when the event sets `autoRecover` and the instance tag `sentinelops:auto-recover` is `true`. The role denies reboot without that tag even if the event is wrong.

Anything else stops at `REQUIRES_APPROVAL`. The platform does not terminate instances.

## Verification

`ec2:DescribeInstanceStatus` must show both instance and system checks as `ok`. A reboot that has not finished stays FAILED and the operator is notified.

## Manual recovery

Check the instance status checks, system log, and whether the volume is attached. Start or replace the instance by hand if reboot did not restore the checks. Do not add terminate to the worker role to speed that up.

## Rollback

A reboot cannot be undone. If the instance should not have been rebooted, remove the `sentinelops:auto-recover` tag so the role cannot do it again, and fix the policy input that marked the environment recoverable.
