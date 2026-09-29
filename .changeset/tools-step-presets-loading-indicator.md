---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

Show a progress bar while the Tools step reads the installation's presets.

The Presets card on _Choose the agent's tools_ is filled from muster
(`filter_tools({ include_presets: true })`), which takes a moment on a cold cache.
Until the answer arrived the step not only looked static: it offered the three
built-in presets with the notice _Only the built-in presets are known_, a claim
that is not yet true while the read is in flight. The notice now waits for the
read and a `LoadingIndicator` runs in its place. The cards do not wait — the
built-in list stays valid whatever muster answers, so it is selectable from the
first paint, including through the ~7s of retry backoff a failing read takes
before it gives up.

The catalogue below it reads the same way: its `Reading the catalogue…` line gets
the progress bar too.

`LoadingIndicator` in `ui-react` now holds its label back for the same 250ms
`Progress` holds the bar back for. It used to render the label immediately, so a
fetch that resolved in under 250ms flashed a bare line of grey text with no bar
under it — the opposite of what the delay is for. Also affects the Select skills
step and the skill picker on Edit agent, its two other call sites.
