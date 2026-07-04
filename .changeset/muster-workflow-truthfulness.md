---
'@giantswarm/backstage-plugin-muster': patch
---

Decouple the muster workflow availability badge from the validator's `status.valid`, and clarify the workflow Executions/Statistics panels.

A workflow whose aggregated `workflow_<name>` tool executes was reading "Unavailable" purely because muster's validator flagged its definition (e.g. the false-positive that demands a top-level `tool` on `parallel`/`forEach` container steps). The UI then contradicted itself: an "Unavailable" badge next to a working Run button.

- `MusterWorkflow.isRunnable()` now backs the availability badge (every loaded Workflow CR is runnable because muster exposes its `workflow_<name>` tool). The validator verdict surfaces separately as a non-blocking "Validation warning" badge plus a reworded detail-page callout, instead of an "Unavailable" availability state (ADR D2). The workflows-list filter is repurposed from Available/Unavailable to Valid/Validation-warnings to stay coherent.
- The Executions and Statistics panels now state that they reflect engine- and agent-driven runs recorded by muster's aggregator, and that a run launched from the tool explorer executes the aggregated tool directly and is not recorded there (its result is shown inline in the explorer).
