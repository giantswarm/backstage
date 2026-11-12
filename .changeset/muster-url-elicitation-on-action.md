---
'@giantswarm/backstage-plugin-muster': minor
---

`MusterApi.callTool` and `callToolWithProgress` declare URL elicitation only with `urlElicitation: true`, for a call the person started with a click; by default a sign-in the call needs fails it with muster's 401 `server_sign_in_required`, which the page answers with its inline sign-in. An elicited call puts each page to the person once per action, with no answer kept between actions, and a declined, dismissed or unfinished sign-in fails it with the same 401. The tool page's Run declares it.
