---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The new-session screen preselects the installation's default agent (agent-manager's `get_info` `defaultAgent`) and lists it first in the picker; a `?agent=` link or the person's own pick still wins. `?agent=` also accepts `<namespace>/<name>`. A `?prompt=` parameter prefills the prompt without sending it and is removed from the address once read. Same-origin links in agent replies now open in the portal's tab, query kept, instead of a new tab; `/api/…` links still open in a new tab and `#…` links stay on the page.
