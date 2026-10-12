# Threat model

SentinelOps can change customer resources. That is the feature, and it is also the main risk.

## Assets

- Incident records and the audit timeline
- The remediation roles
- The queue that is allowed to trigger those roles
- The dashboard session

## Actors

- An operator with the dashboard
- A principal who can put events on the custom bus or change a CloudWatch alarm
- A principal who can change a monitored resource
- The platform Lambdas

## Boundaries

The processor cannot mutate S3, EC2, security groups, or Auto Scaling directly. It can invoke five functions. Those functions reject an action they do not own, and their roles cannot perform the other actions.

Reboot requires the instance tag `sentinelops:auto-recover=true`. Scale-out requires the group tag `sentinelops:scale=true`. A bug that skips the policy engine still cannot reboot an untagged instance or grow an untagged group.

The public SSH worker revokes `0.0.0.0/0` and `::/0` on port 22. It does not authorize a replacement rule and it does not delete the security group.

Unknown events become `ALERT_ONLY`. There is no path from an unrecognized event to a write API.

The HTTP API is JWT-authorized. It can read incidents. It cannot simulate, remediate, or write DynamoDB. Simulation exists only on the local process.

The audit bucket blocks public access, denies non-TLS requests, and the processor can `PutObject` only under `incidents/`.

## Accepted risks

- Account-wide `PutBucketPublicAccessBlock` is deliberate. A public bucket may not carry a tag, so tag conditions would miss the incident this system exists to close. The action list is still only the public access block APIs.
- `RevokeSecurityGroupIngress` is account-wide for the same reason. The code path only submits public SSH ranges.
- The custom event bus is trusted. A principal who can `events:PutEvents` on it can open an incident. They still cannot choose an action outside the policy, and the worker roles still enforce tags.
- Verification of CPU can fail while a scale-out is still taking effect. The incident stays unresolved rather than being marked healthy early.
- Credentials are not stored in the repo. A deploy uses GitHub environment secrets and a reviewer gate. Those secrets are not created here.

## Out of scope

Terminating instances, deleting buckets, editing IAM, and changing production route tables are not actions. Adding them would require a new policy mode and a different role. They should not be added to the existing worker roles.
