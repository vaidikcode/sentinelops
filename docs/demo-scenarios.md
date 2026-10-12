# Demo scenarios

Run `npm run dev` and use the buttons on the dashboard, or run `npm run simulate -- <name>` from the repo root.

These scenarios use the real policy and lifecycle. They do not call AWS.

## Security incident

`public-s3`

A bucket is reported public. The policy classifies it CRITICAL, blocks public access, verification succeeds, and the timeline ends at RESOLVED.

`open-ssh` is the same shape for a security group: only the public SSH ranges are in the remediation plan.

## Infrastructure incident

`unhealthy-ec2` recovers a development instance.

`cpu-overload` and `queue-backlog` scale a named target by one.

A production instance without `autoRecover` is covered by the unit tests. It stops at REQUIRES_APPROVAL and the remediator is not called.

## Processing failure

`remediation-failure`

The worker throws three times. Each attempt is recorded as FAILED. The dead-letter step then sets REQUIRES_ATTENTION. One incident id is reused across the attempts.

## Duplicate event

`duplicate`

The same event id is delivered twice. The first run remediates. The second result is `duplicate`, and the remediator was called once.

## Verification failure

`verification-failure`

The worker reports success and the checker reports the bucket is still public. Status stays FAILED. A second automatic attempt is not started.

## Unknown

`unknown`

The signal is stored, an alert is recorded, and the remediator call count is zero.
