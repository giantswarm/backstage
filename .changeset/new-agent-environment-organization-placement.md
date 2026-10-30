---
'@giantswarm/backstage-plugin-agent-platform': patch
---

New agent form: the Environment and Organization fields read like the form's other fields (a field label and description instead of a card heading) and sit together, Environment first: in the main form when either is a dropdown, else both are lines under More options. Environment preselects the home installation, else the first usable one; Organization is one dropdown (Platform, then the organizations and other namespaces) instead of a radio group and a dropdown, its first entry preselected. A sole environment or organization is a line, not a control; a portal's only environment is named first under More options. Continue waits until the organization is known, and says why while it is read or could not be. The agents list starts the form's agent-manager reads for the likely environment, so Organization no longer arrives late.
