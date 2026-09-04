---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The session timeline now shows why a turn failed. kagent records the reason — for
example the model provider's `404 model_not_found` for a model the account cannot
use — only on the failed task's `status.message`, which the timeline read solely in
the awaiting-input states, while the streamed terminal event rendered it as the
agent's prose that the poll then replaced with nothing. A failed turn therefore
showed the user's message with no reply under it and a "Failed" badge as the only
sign. It now closes the turn with a red alert carrying kagent's reason, both live
and after the poll.
