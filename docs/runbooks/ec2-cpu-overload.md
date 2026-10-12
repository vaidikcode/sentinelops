# EC2 CPU overload

## Detection

Alarm `sentinelops-ec2-cpu-<instance-id>`: average `CPUUtilization` greater than 80 for one 5-minute period. Direct events must report `cpuPercent` above 80 and `durationMinutes` of at least 5. Shorter spikes are ignored.

## Severity

HIGH. Action: `SCALE_OR_RECOVER`.

## Automatic action

Desired capacity of the named Auto Scaling group is increased by 1, up to its max size. The group must be tagged `sentinelops:scale=true`. If there is no target, or the group is already at max, the incident stops at `REQUIRES_APPROVAL` and nothing is resized.

## Verification

The latest 5-minute average must be at or below 80. A scale-out that has not changed the metric yet stays unresolved.

## Manual recovery

Inspect the workload before raising max size. Confirm the group tag before expecting automation to act.

## Rollback

Lower desired capacity on the Auto Scaling group. The platform will not scale down by itself.
