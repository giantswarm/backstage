---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The new-session screen preselects the installation's default agent (agent-manager's `get_info` `defaultAgent`) and lists it first in the picker, marked Default; a `?agent=` link or the person's own pick still wins, and a late default does not replace the agent shown once the person has typed. `?agent=` also accepts `<namespace>/<name>`. `/?agent=<id>#prompt=<brief>` prefills the prompt without sending it, marked as coming from a link; the brief stays in the fragment, is removed from the address once read and is filtered from Sentry. A brief that replaces a stored draft offers the draft back. In agent replies, new-session links open in the same tab; other links open in a new tab, `#…` links stay on the page.
