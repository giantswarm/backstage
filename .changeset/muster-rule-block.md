---
'@giantswarm/backstage-plugin-muster': minor
---

The rule for new tools on a connector's Test & Tools step takes a third choice, _Block_, beside _Allow_ and _Ask_, where muster's `core_mcpserver_set_approval` takes it: tools the connector adds later are hidden and refused until someone sets them. _Ask_ stays pre-selected on a governed platform. The Tools tab says when a connector's rule hides tools added later.
