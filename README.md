# SentinelOps

Event-driven AWS incident detection and auto-remediation.

AWS resources emit signals. EventBridge routes them to SQS. A processor Lambda classifies the signal, applies a remediation policy, and — only when that policy says the action is automatic — invokes a narrowly scoped remediation Lambda. A separate read-only Lambda verifies the resource. DynamoDB stores the incident and its timeline. SNS notifies. S3 keeps the audit JSON.

The dashboard is a reader. It does not remediate anything.

```text
CloudWatch / Config / custom event
  → EventBridge
  → SQS (incident-events) → processor Lambda
                          → DLQ after 3 receives → DLQ Lambda
  → policy decision
  → remediation Lambda (S3, EC2, security group, or queue scaling)
  → verification Lambda
  → DynamoDB + S3 audit + SNS
  → API Gateway → dashboard
```

## What runs without an AWS account

The incident engine is plain TypeScript. The local API uses the same pipeline with in-memory AWS stand-ins, so the lifecycle, policy, retries, and duplicate handling can be exercised before any account exists.

```bash
npm install
npm test
npm run dev
```

Open http://localhost:5173. The page lists seeded incidents and can run the controlled scenarios.

`npm run simulate -- public-s3` prints one scenario as JSON. Other names: `unhealthy-ec2`, `cpu-overload`, `open-ssh`, `queue-backlog`, `duplicate`, `remediation-failure`, `verification-failure`, `unknown`.

## Incident policy

| Incident | Severity | Action | Automatic when |
| --- | --- | --- | --- |
| EC2 CPU above 80% for 5 minutes | HIGH | Raise the tagged Auto Scaling group by 1 | A scale target is present |
| EC2 status check failed | HIGH | Reboot | Development, or `autoRecover` on a tagged instance |
| Public S3 bucket | CRITICAL | Put the public access block | Always |
| SSH open to `0.0.0.0/0` or `::/0` | CRITICAL | Revoke that rule only | Always |
| Queue depth above threshold | MEDIUM | Raise the tagged consumer group by 1 | A scale target is present |
| Anything else | LOW | Alert only | Never |

Severity does not by itself authorize a change. The policy does. Production instance recovery without `sentinelops:auto-recover=true` stops at `REQUIRES_APPROVAL`. Scaling without a target does too. Terminate, delete, network rewrites, and IAM changes are not implemented actions.

Queue backlog is MEDIUM and still automatic, because the policy table explicitly approves consumer scale-out. The severity label is not the approval.

## Reliability

- The incidents table stores the record. A second table stores `eventId → incidentId` and the insert is conditional. A repeated event returns the existing incident and does not call remediation again.
- A failed remediation throws, so SQS retries. `maxReceiveCount` is 3. The third failure leaves the incident `FAILED`; the DLQ Lambda moves it to `REQUIRES_ATTENTION`.
- If remediation succeeds and verification does not, the incident stays `FAILED` and SNS is notified. The message is acknowledged so the same fix is not applied again on a retry.
- Remediation calls are safe to repeat: the public access block is a put of the same configuration, SSH revocation removes only the public ranges, and a missing rule is treated as success.

## Least privilege

Each Lambda has its own role.

- Processor: read the queue, write incident records, publish SNS, put audit objects, invoke the five worker functions.
- S3 remediation: `s3:GetBucketPublicAccessBlock` and `s3:PutBucketPublicAccessBlock` only.
- EC2 remediation: reboot only instances tagged `sentinelops:auto-recover=true`. Scale only groups tagged `sentinelops:scale=true`.
- Security group remediation: describe groups and `ec2:RevokeSecurityGroupIngress`.
- Queue remediation: the same tagged scale permission, and no queue mutation.
- Verification: read-only checks.
- API: `dynamodb:GetItem` and `dynamodb:Query` on the incidents table.

None of the roles use `AdministratorAccess`.

## Deploy later

This repository does not apply infrastructure on its own. When you choose to:

```bash
npm run build -w backend
cd infrastructure/terraform
terraform init
terraform plan
```

Set `alert_email`, `demo_instance_id`, or `demo_queue_name` only for the resources you intend to watch. Leave them empty and the platform still deploys with no demo alarms and no EC2 instances.

The HTTP API requires a Cognito JWT. The local dashboard does not. Point a production build at the API with `VITE_API_URL` and store the bearer token in `sessionStorage` under `sentinelops_token`.

GitHub Actions runs typecheck, unit tests, the frontend build, `terraform fmt`, and `terraform validate` on pull requests. The deploy workflow is `workflow_dispatch`. Protect the `production` environment with required reviewers before enabling apply. Apply still needs `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` repository secrets.

## Layout

```text
backend/          incident model, policy, Lambdas, local API
frontend/         React dashboard
infrastructure/   Terraform
docs/             architecture, threat model, runbooks, demos
```

Further reading: [architecture](docs/architecture/overview.md), [threat model](docs/security/threat-model.md), [demos](docs/demo-scenarios.md), [runbooks](docs/runbooks/public-s3-bucket.md).
