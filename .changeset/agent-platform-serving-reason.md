---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Say what is wrong with a served model that is not Ready. model-manager 0.23.4
reports a `reason` next to `status` and `message` for every served model of
the kserve backend — the Ready condition's reason (`HTTPRoutesNotReady`), a
failed load's, or the predictor pod's while it waits (`Unschedulable`,
`ImagePullBackOff`) — and calls an object whose predictor pod is Pending
`Pending`, whatever its conditions say. The portal now shows that word next to
the status wherever the model's state appears: the Serving page's status cell
reads **Pending · Unschedulable** with the scheduler's text (`0/3 nodes are
available: 3 Insufficient nvidia.com/gpu.`) under the label and on hover; the
model detail card, the Model configs and the Agents tables' model column and
the session composer's warning carry the same word. Said once: the reason is
stripped from the front of model-manager's one-line message.

- A model being deleted reads **Stopping** — a new `terminating` readiness,
  neutral — instead of a red **Not ready**; it still counts as a serving
  failure for the composer's warning, since the model is going away.
- The CR-read InferenceService agrees with model-manager: the Ready
  condition's reason (else the last failure's, else the first failing
  component's) is the row's word, and a Pending predictor pod — a container
  waiting (`ImagePullBackOff`), else `PodScheduled=False` (`Unschedulable`) —
  makes the row `pending` with the pod's reason and message, whatever the
  object's conditions say. An InferenceService with a `deletionTimestamp` is
  `terminating`. A folded row keeps its base's status, reason and explanation
  together.
- Nothing changes for a Ready model, or for the rows of a backend that names
  no reason (Ollama, LM Studio, Lemonade).
- `kubernetes-react`: `InferenceService.getReadinessReason()`,
  `Pod.getPendingState()` (with `status.containerStatuses` /
  `initContainerStatuses` and the pod's own `reason` / `message` on
  `PodInterface`), `KubeObject.getDeletionTimestamp()`.
