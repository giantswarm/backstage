---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Session messages can carry images. The session page's composer, the home and
Sessions composer and the New session dialog attach images pasted from the
clipboard, dropped on the box or picked with Attach images, as removable
thumbnails; they go to the agent as A2A file parts with the message, and the
transcript shows them as thumbnails that open at full size. PNG, JPEG, GIF and
WebP only, scaled down to 2,000 px, at most 2 MiB each, 4 images and 3 MiB per
message, and 16 MiB per session, checked in the composer and the backend. An
agent on the Claude Code or Codex runtime, or with an Ollama model, says it
cannot take images. The backend's message routes take 5 MB bodies, and a
conversation too large for one task listing is read in smaller pages. `ui-react`
adds `ComposerAttachmentList`, and `ComposerFrame` gains an `attachments` slot
and a drop state (`isDropTarget`, `dropLabel`). The chart raises ingress-nginx's
`proxy-body-size` to `6m`.
