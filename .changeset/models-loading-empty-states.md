---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Models › GPU capacity and Serving: the GPU node pools, Model cache and GPU
capacity cards show a loading indicator instead of an empty table while they
are read, and a message instead of an empty table when there is nothing to
list. The Model cache card is only on GPU capacity now, as its last card. On
Serving, each installation's backend is a card of its own — its header, its
table or the note that it serves nothing yet, and the opened model's steps.

The kebab menus of served models, downloads and a model config's details page
get a definite width, like the agent and session menus: opening one no longer
trips the browser's ResizeObserver loop warning, and "Remove model config"
fits on one line.
