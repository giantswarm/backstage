---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

Text links in the Agent Platform shell now share one style: the link colour and
a solid underline on every surface. Links that act as controls (rail items, the
logo, breadcrumbs, a wizard's steps, Close and Cancel, row and card titles, the
skill file tree) pass bui's `standalone` and keep their own look.
`ExternalLink` now carries its link's underline onto its content, so an
underline also shows on an external link.
