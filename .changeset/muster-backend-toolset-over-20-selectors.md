---
'@giantswarm/backstage-plugin-muster-backend': patch
---

`GET /tools/filter` reads repeated `toolset=` parameters from the raw query
string, so a toolset keeps every selector in order however many there are. The
backend's query parser turned more than 20 repeats into an object, which was
refused with "toolset must be a string or a list of strings", so the Tools tab
of an agent with many selectors could not show its tools. `GET /executions`
refuses a `workflow_name` given more than once instead of ignoring it.
