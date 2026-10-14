---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The create-agent wizard's Tools step ("What may it do?") is simplified to the
design's blast radius.

- **Access level**, a single choice: _Nothing outside the chat_ (the new
  agent's default: no tools, and the selection below turned off), the presets
  (_Look things up_ = read-only, recommended; environment presets; _Look things
  up and make changes_ = Full gateway, warned), and _Only the tools I choose
  below_ (no preset). A preset is the base the picks below add to.
- **Which apps?**: every connector with its tool count and _Read-only_ / _All_.
  Read-only picks the connector's read-only tools one by one; All picks the
  whole connector, so tools it adds later too. Tools picked individually show
  as "N of M selected". Paged, with a search past eight connectors.
- **Choose individual tools instead** opens the catalogue, with copying another
  agent's toolset and adding a selector by name moved inside it.
- **Selected**: a rail beside the step lists the selection by connector, how
  many tools it resolves to and how many of them change things; narrower
  screens keep the summary bar.
- "Server" is "connector" throughout the step. Editing an agent shows its
  toolset as it is: nothing is rewritten until the author changes something.
