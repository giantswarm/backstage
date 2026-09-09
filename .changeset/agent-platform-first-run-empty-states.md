---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Agents and Sessions tabs now invite the first agent and the first session
instead of showing an empty table. On a fleet with no agents, both tabs drop the
table and show a card explaining what an agent is, with a **Create your first
agent** button — previously the Agents tab showed column headers over the words
"No agents found." and left the only create affordance in the page header, and
the Sessions tab explained the absence in one grey sentence with no way to act
on it.

With agents but no sessions, the Sessions tab drops its empty table and search
field and puts the new-session composer, expanded, in that same card under
"Start your first session" — so the prompt box is the invitation rather than a
collapsed strip above nothing.

An empty list alone is not enough to make either claim. Neither tab invites
creation when the agents could not be _read_ — an empty list because every
installation failed is not an empty fleet, and pointing the user at the create
flow would send them down the wrong path. The agent invitation additionally
requires an installation in scope that runs kagent, so pinning to one without it
keeps the table rather than offering a create flow with no target right below a
note saying kagent is not installed there. And the session invitation requires
that at least one installation was actually queried, so a portal that cannot
reach any kagent endpoint no longer reports "you have never started a session".

Those cases still get the "couldn't read" warning, and a fleet whose agents are
all deployed-but-not-ready still gets the sentence pointing at the Agents tab.
