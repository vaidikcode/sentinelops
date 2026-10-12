# Public S3 bucket

## Detection

Config rule `S3_BUCKET_PUBLIC_READ_PROHIBITED` (or `S3_BUCKET_PUBLIC_WRITE_PROHIBITED`) evaluates NON_COMPLIANT, or a direct event arrives with `kind: S3_PUBLIC` and `publicAccess: true`.

## Severity

CRITICAL. Action: `BLOCK_PUBLIC_ACCESS`. The policy allows it without an operator.

## Possible causes

A bucket policy or ACL was changed, or the account-level public access block on that bucket was removed.

## Automatic action

`s3:PutBucketPublicAccessBlock` with all four flags set: `BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`.

The worker role has those two S3 actions and nothing else. It does not delete the bucket or rewrite an unrelated policy.

## Verification

`s3:GetBucketPublicAccessBlock` must show all four flags. If the configuration is missing, the check fails.

## Manual recovery

Confirm the block in the S3 console. If an application legitimately published objects, move that data to a bucket that was designed to be public and leave this block in place.

## Rollback

There is no automatic rollback. Removing the block is an operator change outside this policy. Do that only after the objects are no longer exposed.
