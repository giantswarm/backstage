---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Carry the whole conversation into the new session offered when a session's
runtime is lost, as already happens when kagent does not take an answer. The
new session's first message holds the conversation so far (messages, and tools
by name) and the open question with any answer that never reached the agent,
within the message size limit. It is titled "Continued: <title>" and shows a
"Continued session" banner linking to the lost session. The way on is a
"Continue in a new session" button inside the notice, which says what the new
session will start with. A session that can no longer continue (a reported
runtime loss, or an answer kagent did not take) shows no message box; while a
runtime loss is only suspected, the box stays for a retry.
