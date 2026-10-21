---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

A session started in a workspace shows it: the session's header has a chip
with the workspace's name, its last sync and how many repositories were
fetched fresh at the start. The chip opens a drawer with a link to the
workspace, the repositories fetched before the first turn, the workspace's
repositories, this session's directory with its size and cleanup date, and
the provider you act as in it. The Sessions list gains a Workspace column and
the session rail names the workspace beside the agent. A workspace you can no
longer see shows unnamed; a session without one looks as before. The backend
relays a Session's workspace volume, fetched repositories and providers from
kagent, whose API it now speaks at kagent-upstream v1.22.2.
