---
'@giantswarm/backstage-plugin-muster-backend': patch
---

`GET /tools/filter` accepts more than 20 `toolset=` parameters. The backend's
query parser turns a parameter repeated past 20 times into an index-keyed
object, which was refused with "toolset must be a string or a list of
strings", so the Tools tab of an agent with many selectors could not show its
tools.
