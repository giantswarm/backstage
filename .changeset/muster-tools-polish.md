---
'@giantswarm/backstage-plugin-muster': patch
---

Polish the muster tool explorer: pre-select enum defaults, keep result-table headers readable, and collapse the large browse groups.

- Enum/select argument fields now pre-select the schema `default` (e.g. `x_kubernetes_list`'s `output` shows `slim`) so the form reflects the value the tool will actually use instead of rendering a blank select.
- Result-table column headers no longer squeeze to one letter per line: header cells get `white-space: nowrap` and the horizontal scroll handles the width.
- The browse tree now expands only the Core group by default, so the 282-row Workflows group is collapsed on load (consistent with the MCP-servers collapse-by-default direction); the long tail is reached via search.
