---
'@giantswarm/backstage-plugin-muster': patch
---

Support muster's `sigv4` MCPServer auth type (muster#1082, v5.4.0) end to end:
the registration wizard composes it, the server manager renders it, and the
vendored MCPServer CRD fixture is refreshed so the conformance tests run against
the schema and CEL rules that shipped with it.

The wizard's auth question gains a fourth answer, "AWS request signing (SigV4)",
which composes `auth.type: sigv4` plus the `auth.sigv4` block (region, and the
optional service and assumed role). It is the odd one out among the choices —
not SSO but a machine identity, where every request signs as muster itself and
all users share one AWS identity — so the step says so where the choice is made,
and the server detail view repeats it above the signing configuration.

All four of the CRD's new rules are enforced as the user answers rather than as
a rejected apply: the signing block is required with the type and offered with
nothing else, the SSO fields it excludes are disabled with the reason, and the
choice itself is withdrawn on the SSE transport. Two things the rules allow but
that produce a broken or — worse — quietly wrong server are surfaced as
non-blocking advisories: a signing region the endpoint URL does not mention, and
a missing `AWS_REGION` request-metadata entry, without which an AWS-hosted
backend answers confidently about its own default region.

`spec.meta` comes with it. The details step takes request metadata as
`NAME=value` lines, the composed definition and the GitOps manifest carry it,
the ad-hoc JSON editor no longer drops it from an existing server, and the
server detail view lists it. The review step's CLI fallback reports that
`muster create mcpserver` cannot express either field instead of printing a
command muster would reject.

A 401 from a SigV4 server is a connection failure, not a sign-in prompt: nothing
in the servers page, the tool list or the wizard's verify step now offers a login
a user could never complete for one.
