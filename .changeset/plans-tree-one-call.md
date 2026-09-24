---
'@giantswarm/backstage-plugin-plans-backend': patch
'@giantswarm/backstage-plugin-plans': patch
---

The Merged tab of the Plans page no longer fails with `429 too many requests`
from GitHub's hosted MCP server. The plans backend reads a branch's tree in
one `get_repository_tree` call (the GitHub MCP server's `git` toolset, which
the hosted server serves when the muster MCPServer sends
`X-MCP-Toolsets: default,git`) instead of walking the repository one
directory listing per folder, every folder of a level in parallel, twice per
page load — about 250 calls for a repository of a hundred folders, a burst
the hosted server refused. One tree fetch per repository and ref is shared by
the tree and epics routes, concurrent requests included, and kept for a
minute. A refused pace is answered as `429` with
`error.name: TooManyRequestsError`, and the page does not retry it.
