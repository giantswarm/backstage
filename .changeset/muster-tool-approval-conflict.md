---
'@giantswarm/backstage-plugin-muster': patch
---

_Done_ on the connector's Test & Tools step reads the tool settings again right before it saves them and writes nothing when another admin changed them meanwhile: the step then shows the current settings with the person's own changes on top and asks to press _Done_ again. muster's `core_mcpserver_set_approval` replaces the settings whole and takes no precondition. Where the settings cannot be saved from the portal, the step says that _Done_ saves nothing.
