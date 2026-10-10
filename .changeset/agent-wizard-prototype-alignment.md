---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The agent creation flow follows its design more closely.

- **Describe your agent**: the Swarm Operator assist is a tinted banner above
  the form — the assistant's avatar, "Rather describe it in your own words?"
  and what it does, and _Let Swarm Operator help_ — instead of a small button.
  It still opens the side chat, and still shows only where the
  `agentManagement` meta-agent resolves.
- **Select skills**: the same Source and Usage filters as Customize → Skills,
  each only when it would change the list. Filters work with the search and
  keep the step's grouping and paging; while a filter is picked the step says
  how many skills are selected, since some may be out of sight.
- **Tools** ("What may it do?"): the catalogue is now _Individual tools_,
  opened with _Choose individual tools_. Every tool row says whether it
  **Reads** or **Changes things** (an unannotated tool counts as changing;
  the destructive marker stays), and a long catalogue can be narrowed to
  either kind. The sticky summary takes the design's tinted look and says how
  many of the resolved tools change things. Presets, copying another agent's
  toolset, selectors by name, validation and the resolved list are unchanged.
