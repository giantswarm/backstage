---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Carry the whole conversation into the new session offered when a session's runtime is lost, as already happens when kagent does not take an answer. The new session's first message holds the conversation so far (messages, and tools by name), the open question with any answer the lost runtime never took, and the text in the message box last, within the message size limit. It is titled "Continued: <title>" and shows a "Continued session" banner linking to the lost session. The runtime-lost notice says what the new session will start with.
