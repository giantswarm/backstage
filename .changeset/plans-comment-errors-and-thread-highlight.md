---
'@giantswarm/backstage-plugin-plans-backend': patch
'@giantswarm/backstage-plugin-plans': patch
---

Surface GitHub errors on plan comment writes and make comment threads stand out.

- The backend proxy no longer collapses every non-2xx GitHub response into an
  opaque 500. A GitHub 403 (typically the GitHub App missing `Pull requests` /
  `Issues` write permission) is now mapped to a `NotAllowedError` (HTTP 403) and
  GitHub's own message (e.g. "Resource not accessible by integration") is
  included, so the reply form shows an actionable error instead of a generic
  failure. As a 4xx it also stops being reported to Sentry as a server fault.
- Review threads and the PR discussion now render inside a single primary-colored
  box (with a left accent) instead of blending into the page, so each
  conversation reads as one unit.
