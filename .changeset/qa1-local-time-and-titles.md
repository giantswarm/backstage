---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

`DateComponent` shows the browser's local time below a `DateTimeZoneProvider` set to `local`, with the full timestamp and its zone on hover; without a provider it stays UTC. The Agent Platform shell sets it, so its lists and detail pages show one clock. `DateComponent` no longer passes its `tooltip` prop to the DOM.

Every Agent Platform page now sets a document title such as "Lab Helper · Agents · Agent Platform". `ShellPage` and `WizardFrame` set it from their breadcrumbs or title (`documentTitle` overrides), through the new `ShellDocumentTitle`, which an outer title template cannot suffix a second time.
