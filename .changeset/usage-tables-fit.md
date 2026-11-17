---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

The Usage · Cost tables keep their headers and figures whole: each column has a minimum width for its header and usual value, and the By agent, By organization and By person tables take their compact columns (the name and its spend) wherever the card is too narrow for them, as By model already did. By model's "Avg tokens/call" is now "Tokens/call", and a name cut after two lines in a compact table shows in full on hover. `tableMinWidth` counts a column's own numeric `minWidth`.
