---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

Search and filter the tool settings of a connector (the connector wizard's Test & Tools step and its edit) with the same search and "What it does" filter as the connector's Tools tab; a preset on a narrowed list sets only the shown tools, and hidden tools keep their settings. Move "Change tool settings" into the connector page's menu. Disable Edit and "Change tool settings", with the reason, when muster says the person may not edit the connector, and say plainly that they lack edit rights when a save is refused for it. A disabled menu item can now carry a reason.
