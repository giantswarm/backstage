---
'@giantswarm/backstage-plugin-muster': minor
---

Inside the agent-platform shell, registering a connector is the prototype's
full-screen three-step wizard — **Connect / Sign-in / Test** — on the same
addresses the classic four-step wizard keeps outside the shell.

**Connect** takes the server address and probes it live through
`core_mcpserver_detect` (the inline "Server found" state names the server, the
detected transport and whether it asks for a sign-in), plus the connector's
name and an optional description; the transport comes from the probe rather
than a control. The prototype's "Who can use it?" audience choice is not
asked: muster registers a connector for the whole installation and has no
visibility setting to map it to. **Sign-in** offers the four decided modes —
each person's own account (per-user OAuth), Company login (token forwarding,
with required audiences and the restart caveat as help text), no sign-in, and
AWS request signing (SigV4, offered only on the Streamable HTTP transport,
with the shared-identity warning) — and its "Add connector" validates and
creates the server through muster directly. **Test** follows the new connector
live until it connects, offers the one-time sign-in where one is needed, and
lists its tools with read/"Changes things" badges and the counts ("N tools — X
that read and Y that change things"), previewing six with a "Show all" link.

Per-user OAuth gains the GitHub-grade advanced settings muster already
supports, behind an "Advanced" disclosure: pinned authorization and token
endpoints (set together, as the CRD requires), a Kubernetes Secret reference
for an out-of-band registered OAuth client (`clientCredentialsSecretRef` —
name, namespace and key names; never the credential itself), and the grant
scope (per login session, or per person across sessions). The composed
definition, validation and the edit round trip model these fields, so a
connector registered with them can be edited without losing them; token
exchange, `forwardIdentity` and plaintext header credentials stay deliberately
unoffered. The vendored MCPServer CRD fixture is refreshed to the version that
carries these fields and their CEL rules.
