---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

The avatar proxy forwards raster images only (PNG, JPEG, GIF and WebP); an SVG
or any other type from the avatar service takes the fallback path, and the
browser shows the initials. A failure is logged under a fixed message per kind
of problem, with the content type and other varying parts as metadata.
