---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Model hosting's actions sit in the platform's standard places at the top right of the page header, as on an agent's or a skill's page, instead of a free-floating row of up to five buttons (~730px wide, wider than a phone). On Running models, **Serve model** is the primary button, **Import from Hugging Face** (or **Pull model** where nothing imports) the secondary beside it, and adding a model backend or a GPU node pool are in the ⋯ menu; on GPU pools, **Add GPU node pool** is the primary. At phone width one button stays and everything else moves into the menu, so the header never runs past the screen.
