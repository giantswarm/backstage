---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Show an error when kagent does not take an answer to the agent's question. An answer whose stream said nothing (a 202, or an empty stream) used to count as sent: the button came back and nothing else happened. The session is now read until the answer shows up in it. If the same question is still open without it after 15 seconds, the session page replaces the question card with "Could not resume this session" and offers a new session with the same agent instead of a retry. The new session starts with the conversation so far (messages, and tools by name), the open question and the answer, within the message size limit, and the notice says what it will carry.
