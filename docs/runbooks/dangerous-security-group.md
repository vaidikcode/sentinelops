# Dangerous security group

## Detection

Config rule `INCOMING_SSH_DISABLED` is NON_COMPLIANT, or a direct event reports TCP 22 from `0.0.0.0/0` or `::/0`. Other public ports are not remediated.

## Severity

CRITICAL. Action: `REMOVE_PUBLIC_SSH_RULE`.

## Automatic action

Describe the group. Revoke only the 22/tcp ranges that are `0.0.0.0/0` or `::/0`. A private `10.0.0.0/16` range on the same port is left in place. If the public range is already gone, verification-ready success is returned and nothing is revoked.

## Verification

Describe the group again. Public SSH ranges must be absent.

## Manual recovery

If administrators still need SSH, add a rule for a specific network or a bastion. Do not restore `0.0.0.0/0`.

## Rollback

Re-adding the public rule is an operator decision. The next NON_COMPLIANT evaluation will open another incident and remove it again.
