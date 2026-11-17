---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Long names and narrow tables stay inside the page. The Usage tabs' By agent and By model tables show their compact columns, with names on two lines, wherever they are too narrow for all of them (beside the side rail at tablet width), and keep a sort on a column they show. Long agent names on Home's recent agents and the Used by tabs wrap to two lines on a phone and end in an ellipsis on a desktop, and the Usage overview's top agents stay within their column. A narrow New session composer leaves out the toolchains button's caret, so the agent and workspace keep room for their names. `useCompactLayout` stays compact until its element is 24px wider than its minimum (`COMPACT_LAYOUT_HYSTERESIS`).
