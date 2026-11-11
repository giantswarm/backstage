---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

`callTool` takes `urlElicitation: false` for a call whose page the caller opens itself: the call declares no URL elicitation to muster, is sent once and puts no page to the person. muster-backend's `/call` and `/call/progress` take the same `urlElicitation: false` in their body and refuse it together with an `input` answer.
