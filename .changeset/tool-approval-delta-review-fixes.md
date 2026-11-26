---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

Tool approval follow-ups: an edit whose tool list was saved before agent-manager refused the approval settings (the chart takes none) now says so instead of "nothing was saved", and reads the agent's generation again before writing the settings when the first write's answer carried none; only the apiserver's RBAC refusal reads as "you don't have rights to edit this connector" (other refusals keep their own message); "Change tool settings" stays in the connector menu, enabled, where muster does not say whether the person is a connector admin; a disabled menu item's reason is shown as text under it and read once.
