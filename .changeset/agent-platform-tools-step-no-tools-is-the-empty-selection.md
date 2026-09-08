---
'@giantswarm/backstage-plugin-agent-platform': minor
---

On the agent creation Tools step, _No tools_ is no longer a preset card: it is
what the empty selection means. The step opens with nothing selected and
Continue enabled — an agent nobody added tools to is a chat-only agent — and
the "Selected so far" bar reads **No tools** until a preset, server, workflow
or tool is added; removing the last selector brings that state back. The
review step shows _No tools_ and the declaration it applies.

The release is unchanged: the wizard declares the empty selection as
`toolset: [preset:none]`, which makes the agent chart omit the gateway entry.
An empty list is a render error in the chart and an absent value is the
unscoped default, so the translation happens at the one point where the
selection becomes a declaration (`declaredToolset`). `preset:none` in a copied
toolset or typed by hand clears the selection instead of appearing as a chip;
`full` stays exclusive; a toolset that cannot be applied (a malformed
selector, more than 32 inline) still blocks Continue.

From the first round of use: a _No tools_ card among the presets read as one
more thing to add, while nothing selected already said it.
