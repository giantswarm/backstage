---
'@giantswarm/backstage-plugin-muster': patch
---

Connector wizard, sign-in step: the advanced settings for "Each person signs in
with their own account" are relabeled in plain language. The client credentials
form a group "Client credentials — stored in a Kubernetes Secret" that asks for
the Secret's name and the names of the keys inside it (never the values), with
the real defaults (`client-id`, `client-secret`, the connector's own namespace)
as hints; issuer, scopes and endpoints get one-line explanations, and the grant
lifetime options read in plain words with muster's term in parentheses.
