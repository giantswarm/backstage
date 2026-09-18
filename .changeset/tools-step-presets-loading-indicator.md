---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Show a progress bar while the Tools step reads the installation's presets.

The Presets card on _Choose the agent's tools_ is filled from muster
(`filter_tools({ include_presets: true })`), which takes a moment on a cold cache.
Until the answer arrived the step not only looked static: it offered the three
built-in presets with the notice _Only the built-in presets are known_, a claim
that is not yet true while the read is in flight, and then replaced both with the
installation's real list. The card now renders `LoadingIndicator` until the
presets are in, and says nothing about them before then.

The catalogue below it reads the same way: its `Reading the catalogue…` line gets
the progress bar too.
