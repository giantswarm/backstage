---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Show each session's state in the sessions list, as a sortable **State** column on
the Sessions tab and on an agent's sessions card.

It reads the backend's existing `GET /kagent/session-states` summary — the one
the session switcher rail already groups by — under the same query key, so a list
and a session page open together share one read per installation. The summary is
asked only of the installations the list actually shows a row from, and on the
baseline 60 s tier rather than the rail's 10 s: the rail watches one installation
for a turn moving, while the list spans the fleet and nobody reads a list column
for progress.

The wording and the tone come from `describeSessionState`, the map the session
page's badge and the rail's groups already use, so one session cannot be called
two things on two screens.

**A cell is never blank.** The three ways a state can be missing are different
facts and a person acts differently on each: `No activity yet` for a session that
reported no state at all, `Unknown` for one the backend could not read — and for
every row of an installation whose whole summary failed — and a dash whose
tooltip says nothing asked, because the session is past the summary's activity
window or its per-pass cap. Collapsing them would let "we could not tell" read as
"nothing is waiting on you".

Sorting the column is by urgency, not by label: waiting, running, failed,
finished, then the kinds of no-answer, each newest first. Alphabetically
`Completed` sorts above `Waiting for input`, which inverts the only reason to
sort by state.
