---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Session details: the user's messages are bubbles in the portal's primary colour instead of a neutral fill behind a hairline border, so a person's own turns read as active in the conversation; the colour follows `app.branding.theme.<mode>.primaryColor`, so a white-labelled portal keeps its own. **Start a new session with &lt;agent&gt;** moves out of the message box to its own right-aligned row beneath it — it leaves the session rather than being one of the box's controls — and the bottom dock gained the gap it was missing, so a lost-runtime notice or a rejected send no longer sits flush against the composer.
