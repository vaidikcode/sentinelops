# SQS queue backlog

## Detection

Alarm `sentinelops-sqs-backlog-<queue-name>` on `ApproximateNumberOfMessagesVisible`, or a direct event whose depth is above its threshold.

## Severity

MEDIUM. Action: `SCALE_PROCESSING`. This one is automatic even though MEDIUM incidents are otherwise notify-only, because the policy explicitly approves consumer scale-out.

## Automatic action

The consumer Auto Scaling group named on the event is increased by 1 when it is tagged `sentinelops:scale=true` and it is below max size. The queue itself is not purged or deleted.

## Verification

`sqs:GetQueueAttributes` (resolving a queue name with `sqs:GetQueueUrl` when the id is not a URL). Depth must be at or below the threshold. If consumers have not caught up, the incident stays FAILED.

## Manual recovery

Inspect the consumer logs before raising max size. A poisoned message belongs on the consumer's own dead-letter queue; this platform does not delete messages from the workload queue.

## Rollback

Reduce the consumer group's desired capacity manually.
