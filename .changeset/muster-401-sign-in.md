---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

A person who has not signed in to cluster-manager sees "Sign in to
cluster-manager to see GPU node pools" with its Sign in on the GPU capacity
and model cache views (and on Add GPU node pool's cluster list) instead of an
authentication error, and the view fills in once the sign-in lands. Every
`401` from muster-backend now says why in `error.reason`
(`server_sign_in_required` with the server, `token_missing`, `token_expired`,
`token_rejected`) and is logged with it. The muster client refreshes the
forwarded token ahead of its expiry, sends a call once more after a refresh
for a refused token, and no query retries a muster `401` with backoff. New
exports: `ConnectorSignInAlert`, `splitConnectorSignIns`,
`musterSignInRequiredOf`, `musterUnauthorizedInfoOf`, `isMusterAuthFailure`,
`shouldRetryMusterQuery`, `MusterUnauthorizedError` and the
`MusterUnauthorizedReason` type (muster); `MusterUnauthorizedError` and
`toMusterUnauthorizedError` (gs-node); `MUSTER_UNAUTHORIZED_REASONS`,
`MUSTER_TOKEN_REASONS`, `isMusterUnauthorizedReason`,
`MUSTER_TOKEN_EXPIRED_TEXT` and `MusterUnauthorizedReason` (gs-common, the
contract both sides share).
