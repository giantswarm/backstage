---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Usage and model hosting read on a phone.

- **KPI tiles:** at phone width the headline tiles sit two across instead of one per row, so the Usage tabs, model hosting and the agent and model pages no longer open with 400–500px of tiles.
- **Cost tables:** at phone width By agent keeps the agent and its cost, and By model keeps the model, its cost and average tokens per call. A model id wraps to two lines instead of being cut to a few letters. Before, five or six columns were squeezed until the amounts were clipped. Models with no usable price keep the model and the reason. The model a client asked for appears under the model that answered, and the reason wraps instead of being cut off.
- **Your sessions, By agent:** at phone width the table keeps the agent, its sessions and the estimated cost. A cost the agent's runtime reported appears under the agent's name.
- **Removed agents:** what the Removed mark means now opens on a tap. Before, it was only a hover title.
- **Busiest agents:** at phone width a long agent name gets its own line and wraps, with the share bar under it.
- **Time range:** on a phone or touch screen, Your sessions says beside the control why the longer ranges are off. Before, the reason was only a hover title on the greyed buttons.
- **Activity heatmap:** a day can be selected with a tap, a click or the arrow keys, and its figure appears under the legend. Before, a day's figure was only a hover title. Cells are bigger at phone width.
- **Running models:** at phone width each model is a row of its own. The status and its explanation, where it runs, the features and APIs in words, and what uses it sit under the name. The actions menu stays at the row's end. Before, up to ten columns squeezed every cell and clipped the menu. A long endpoint in a backend's header now truncates instead of widening the card.
- **GPU pools:** at phone width each pool is a row of its own, with the lifecycle chevron and a ⋯ menu holding Remove pool. Before, Remove pool and the chevron were clipped off the table.
- **Model cache:** at phone width each claim is a row of its own, with Remove cache in a ⋯ menu. A read-only claim says why in words.
- **GPU capacity:** at phone width the table keeps the node and its free GPUs. The GPU, its count and memory, the budget and the cache appear under the node. On a phone or touch screen, a node that is not a serving target says why under its name instead of only on hover.
