---
'@giantswarm/backstage-plugin-roadmap': minor
'@giantswarm/backstage-plugin-roadmap-backend': minor
'@giantswarm/backstage-plugin-gs-node': minor
'app': minor
---

The roadmap plugin reads and changes the board through muster as the
signed-in person; the portal holds no GitHub credential and no bot reads the
board on the user's behalf. The frontend forwards the user's main login (Dex)
ID token in `backstage-muster-authorization` on every request, and the
roadmap backend runs pro's board tools (`list_issues`, `get_board_schema`,
`get_item_by_issue`, `get_issue_details`, sub-issue and field tools) through
muster with it (`roadmap.muster: { installation, server, toolPrefix? }`),
which holds the person's GitHub grant. Board reads are cached per person. A
person without a grant gets a "Connect GitHub" step (`GET
/api/roadmap/connection`, a 401 `MusterServerNotConnectedError` carrying
muster's sign-in URL). The `X-GitHub-Token` header, the Backstage `github`
auth provider and the GitHub App installation token are no longer used by
the roadmap plugin; the pro library dependency is gone.

`@giantswarm/backstage-plugin-gs-node` gains the shared
`MusterServerGateway`/`MusterServerClient`, `readMusterServerRef`,
`asConnected` and `MusterServerNotConnectedError` for backend plugins that
run one MCP server's tools through muster on the user's behalf.
