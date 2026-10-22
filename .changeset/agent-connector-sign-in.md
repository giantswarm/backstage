---
'@giantswarm/backstage-plugin-agent-platform': minor
---

An agent with a connector that needs a sign-in can start that sign-in. The
agent editor's Tools step adds `tool:core_auth_login` to the toolset while a
selected connector is one muster signs in to per session or per person, and
says why under "Added for sign-in". It is left out where a preset already
includes it, and for a connector that comes with the portal sign-in. Removing
it warns that the agent won't be able to sign in. An edited agent without it
gets it, shown among the review's changes.

In a session, a sign-in link muster issued to the agent shows as "Sign in to
<connector>" instead of the URL, in messages and questions alike. Once the
sign-in is done it reads "Signed in to <connector>", and a question that
carried the link is answered with its "signed in" choice.
