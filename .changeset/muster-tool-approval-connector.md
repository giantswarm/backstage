---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-analytics-react': patch
---

Tool approval per connector. The connector wizard's third step is now **Test & Tools**: a connector admin picks a preset (*Recommended*, *Allow all*, *Ask all*; pre-selected by the governance mode) that fills `Allow · Ask · Block` pills per tool and the rule for new tools, and *Done* saves every tool's setting explicitly through muster's `core_mcpserver_set_approval`. Everyone else sees the settings read-only. A create sends the mode's `preset` where muster's `core_mcpserver_create` takes one. The connector's Tools tab shows each tool's setting and where it comes from, *New* tools, blocked tools muster hides, an *Approval* filter, and *Allow — not reviewed* with a way to review for a connector without settings. New portal event `Muster.toolApprovalSaved`.
