---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Hosting · Capacity's GPU table and Model hosting's tables take their compact layout wherever their card is narrower than their columns need, such as beside the side rail on a tablet, instead of squeezing every column to a sliver and cutting off the rows' actions. On a phone, a long model config name in Model hosting's "Used by" no longer runs over its description, and Add a pool's placeholder rows fit the screen. ui-react adds `useCompactLayout(minWidth)` and `tableMinWidth(columns)`, `usePhoneColumns` takes `{ compact }` to keep only its columns in a narrow container as well as on a phone, and the test helper `mockContainerWidth`.
