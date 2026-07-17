---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Top-align the content in selectable model and skill cards on the new-agent
page. The grid stretches every card in a row to the tallest card's height, and
the native `<button>` cards were centering their content in that extra space.
The cards now lay their content out as a flex column so it stays pinned to the
top.
