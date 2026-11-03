---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-ui-react': minor
'app': minor
---

Text links in the Agent Platform shell now share one style: the link colour and
a solid underline on every surface. Links that act as controls (rail items, the
logo, breadcrumbs, a wizard's steps, Close and Cancel, row and card titles, the
skill file tree, the connector tool pills) pass bui's `standalone` and keep
their own look.
`ExternalLink` now carries its link's underline onto its content, so an
underline also shows on an external link.
