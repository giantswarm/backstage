---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-gs-common': patch
---

The New agent and Edit agent Tools step names a muster server of an organization namespace (`agents-<name>-<random>`) as muster does, `<namespace>/<name>`: an organization's agent is offered its own organization's servers, marked "The organization's own connector", and never another organization's, and a chosen one is saved as `server:<namespace>/<name>`. A server of an organization that the person leaves by choosing another organization or installation is taken out of the selection. The muster plugin exports `connectorAuthName`, muster's name for a server, and fixture mode serves one connector in each ready organization's namespace.
