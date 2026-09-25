---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
'@giantswarm/backstage-plugin-ai-chat': patch
---

A failed chat reply says why, instead of "An error occurred.": an error from the model provider shows its reason and whether it was already retried ("The model provider reports an error: Overloaded. The request was already tried 3 times. Please try again in a moment."), and any other failure a generic message without internal details. The error box has a "Try again" button that retries the last message, so nothing needs retyping.
