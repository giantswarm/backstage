---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Usage Overview: the Gateway health strip gains **Tokens per second**, the
platform's output speed over the window.

It comes from `agentgateway_gen_ai_server_time_per_output_token`, now registered
in the central metric registry and exported from the gs plugin. The histogram
observes one value per streamed call — that call's own mean seconds per output
token — and the query inverts the **median** of those values. Not the mean,
which is unweighted by reply length: a reply that emitted three tokens after a
long wait is seconds per token, and a handful of those pulled `graveler`'s
63 tok/s median down to a reported 2 tok/s.

Call duration already on the strip is the whole model call, so a long answer
reads as a slow one; this is the figure that separates the two. It is printed
to two significant figures, because the gateway's buckets are coarse enough
that a third digit would be invented, and a platform slower than a token a
second reads `<1/s` rather than `0/s`. It covers the
streamed calls only: a reply asked for in one piece observes no per-token time,
and an installation where nothing streams shows `—` rather than a zero.

The comments and docs saying the gateway's streaming histograms are
permanently empty, and that its metrics carry no `user` label, are corrected —
both claims are false against agentgateway 2.0.0 on `gazelle`. No view breaks
usage down per user yet.

Every stat on the Overview — the cost totals and the gateway health strip —
also gains an info affordance next to its label that says how the figure is
arrived at: which window, which subset of the traffic, mean or median. `Stat`
in `ui-react` takes an optional `hint` for it, rendered as a focusable button
with a bui tooltip rather than a `title`, so the explanation is reachable by
keyboard.
