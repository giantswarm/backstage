---
'@giantswarm/backstage-plugin-agent-platform': minor
'app': patch
---

Manage installation and organization model credentials through the authenticated credential form, including JSON uploads for Claude and Gemini on Vertex AI. Model configuration, default changes and deletion use agent-manager instead of direct Kubernetes writes. Model credential links of both scopes open the form at `/customize/models/credentials/<installation>/<namespace>/<operation>`, which reads the organization or the installation from the request; links to an organization's `credentials/<operation>` keep working.
