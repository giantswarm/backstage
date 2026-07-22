---
'@giantswarm/backstage-plugin-muster': patch
---

Migrate the muster Tool Explorer (`/agent-platform/muster/tools`) to the bui design system (`@backstage/ui`).

- Rebuild the tool browser, detail panel, argument form, and result viewer on bui primitives (`AccordionGroup`, `SearchField`, `Table`, `ToggleButtonGroup`, `Select`/`NumberField`/`TextAreaField`/`Switch`, `Alert`, `Button`/`ButtonIcon`, `Flex`/`Box`/`Text`), removing most per-component `makeStyles` styling in favour of bui layout props.
- Also migrate the shared muster `SectionHeader` (used by all four muster screens) to bui.
- Add render/smoke tests for the migrated Tool Explorer components.
