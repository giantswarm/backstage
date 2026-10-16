---
'app': minor
---

Page views sent to TelemetryDeck carry the template of the route they matched
(`/sessions/:installation/:sessionId`) as `path`, never the address itself, so
no installation, namespace, agent, model, connector, cluster or catalog entity
name, session id, query string or hash leaves the portal; a path no page
matches is sent as `unknown`. Catalog entity, docs, cluster, deployment and
software template page views no longer carry the names they used to
(`entityName`, `entityNamespace`, `installation`, `clusterName`,
`clusterNamespace`, `deploymentName`, `deploymentNamespace`, `templateName`,
`templateNamespace`), and their kind and tab are sent only from a closed set,
anything else as `other`. `page` and `view` are unchanged for every page and tab the app has, so
dashboards built on them keep working; dashboards built on `path` change.
