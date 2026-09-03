---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The session chat keeps the keyboard focus. Starting a session from the sessions
list or the agent page lands on the new session with the cursor in the message box;
sending a message no longer drops it (the box stays editable while the agent works,
only sending is withheld, and the next message can be drafted meanwhile); when the
agent asks a question the first choice or the answer box is focused, and once it is
answered the focus returns to the message box.
