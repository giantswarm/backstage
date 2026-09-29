---
'@giantswarm/backstage-plugin-bot-prs': patch
'@giantswarm/backstage-plugin-muster': patch
---

A dropped connection is no longer reported as marge refusing the run. When the
browser's connection closes before marge answers (a "Failed to fetch", a
roaming Wi-Fi), or the portal's edge answers in its place with a 502, 503 or
504, the Approve and merge and Sweep dialogs say the connection dropped:

- On a preview, that it was only a preview and nothing changed, with
  **Preview again**, which runs only the calls of the teams whose answer was
  lost and keeps every other team's preview in view.
- On an apply, that the outcome is unknown: marge may already have acted on
  some of the PRs, or all of them, and may still be at it. It no longer says
  nothing was approved or merged. The queue is read again, and the alert links
  each PR the apply named, whose evidence comment on GitHub records what marge
  did.

marge's own refusal keeps its wording. The same tells a lost classification
(**Classify now**) and a lost read of the queue apart from a refusal, and the
Sweep dialog no longer reports **Applied** when no team answered.

The muster client keeps the HTTP status on the error of a failed request.
