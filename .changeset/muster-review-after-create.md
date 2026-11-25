---
'@giantswarm/backstage-plugin-muster': patch
---

A connector created with a tool approval preset no longer reads as reviewed. muster stores a create's preset as its rule alone, since the connector lists no tools yet; the Test & Tools step now opens such a connector on that preset expanded against the tools it lists, without marking every tool _New_, and _Done_ writes every tool's setting. The Tools tab says _Ask — not reviewed_ (or _Allow — not reviewed_) until then. The fixture stores a create's preset the way muster does and, like muster, refuses a create without approval settings.
