---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

Sign in a user by the email of the token when it carries no `federated_claims`. The claim is Dex-specific, and reading it unconditionally made every login against another issuer fail with a `TypeError` in the sign-in resolver.
