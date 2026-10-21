---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Session messages can carry images. The session page's composer, the home and
Sessions composer and the New session dialog attach images pasted from the
clipboard or dropped on the box, as removable thumbnails; they go to the agent
as A2A file parts with the message, and the transcript shows them as thumbnails
that open at full size. PNG, JPEG, GIF and WebP only, each drawn and encoded
again before it is sent, which strips its metadata (a photo's location among it)
and scales it to at most 2,000 px; at most 2 MiB each, 4 images and 3 MiB per
message, and 50 images and 16 MiB per session, checked in the composer and again
in the backend. An agent on the Claude Code or Codex runtime, or whose model's
provider kagent sends no images (Ollama, Bedrock, Mistral, SAP AI Core), says it
cannot take images. The backend's message routes take 5 MB bodies, and a
conversation too large for one task listing is read in smaller pages. `ui-react`
adds `ComposerAttachmentList`, and `ComposerFrame` gains an `attachments` slot
and a drop state (`isDropTarget`, `dropLabel`). `kubernetes-react` adds
`harnessRuntimeOf` and `Agent.getInlineHarnessRuntime`. The chart raises
ingress-nginx's `proxy-body-size` to `6m`.
