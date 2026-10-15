---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

The MCP server sign-in notice stands clear of what is docked at the bottom of
the view: a wizard's footer (Continue, Create), the session page's composer and
the shell's mobile bottom bar. It no longer covers those buttons or takes their
clicks. `WizardFrame` publishes its footer's height on the document root while
it is mounted (`WIZARD_FOOTER_HEIGHT_VAR`).
