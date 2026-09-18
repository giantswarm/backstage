---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

Render files attached to a session's messages. A file part was dropped while the
timeline was built, so an attachment showed nothing at all — not the image, not
even a hint that something had been attached.

An allowlisted raster image (PNG, JPEG, GIF, WebP) renders inline, scaled to fit,
with its file name. Anything else renders an inert chip: the name, the declared
type, the size, and why there is no preview. An attachment is conversation rather
than the agent's working, so the timeline's Hidden setting does not remove it.

**The bytes are untrusted input rendered in our own origin**, so the declared
`mimeType` is never acted on. The checks run in order — no payload, a location
rather than bytes, invalid base64, over the 8 MB cap — and only then is the first
18 bytes decoded to derive the type from the magic bytes, so a large image is
never fully decoded just to classify it. The `data:` URL carries the **sniffed**
type, never the declared one.

**An SVG is never previewed**, including one that declares itself `image/png`. It
would not run script in an `<img src="data:…">` — browsers load it in a
non-scripting mode — so this is defence in depth against a later switch to inline
`<svg>`, `<object>` or open-in-a-new-tab, and it keeps SVG's XML-entity and
filter denial-of-service surface out of the page. There is no download link for a
file with no preview: handing untrusted bytes to disk moves the risk to wherever
they are opened next. The bytes never pass through the markdown renderer.

A file kagent only linked to is described, not fetched — the portal would
otherwise make a request on the reader's behalf to a host named by whoever sent
the message.

No CSP change is needed: `img-src` already carries `data:`. A deployment that
overrides `img-src` must re-list it, since Backstage replaces config arrays
rather than merging them.
