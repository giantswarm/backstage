---
'@giantswarm/backstage-plugin-gs': patch
---

Drop the custom catalog entity-page header in favour of the upstream Backstage
UI header.

Backstage v1.53.0 ships the BUI entity-page header, so the entity page now
renders the upstream header for every entity. The GS custom header
(`EntityHeaderBlueprint` wiring plus the `CustomEntityHeader` reimplementation
and the DOM-injected `EntityHeaderIcon`) has been removed. This gives a
consistent header across all entities and keeps the upstream context menu
(Copy URL / Inspect / Unregister) intact. The former GS header icon is dropped;
the icon still appears next to the entity name in catalog tables and entity ref
links via the custom entity presentation renderer.
