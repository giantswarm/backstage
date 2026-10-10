---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Live-round fixes:

- Adding and editing a skill name the page in the browser tab ("Add skill ·
  Skills", "Edit <skill> · Skills") instead of falling back to "Sessions".
- Usage → Top agents reads each row's figures apart — "12 model calls, 53%" to
  a screen reader and in a copy, not "1253%". Nothing changes visually.
- The Active agents tile says "1 model answered" for a single model.
