---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

Usage reports a calendar month: the Time range select offers this month so
far and the two before it beside the days windows, carried in the URL as
`?window=2026-10`. Overview and Cost report exactly that month's UTC days, a
past month evaluated at its end with the change against the month before, the
current month to date. In a month, Cost also shows spend and tokens by person,
the gateway's `user` label, with the calls it named nobody for as "No person
recorded"; with the Organization scope that is one organization's month by
agent and by person. Your sessions and Connectors keep their days windows: the
months are disabled choices there, and a month a link names there reads as the
default days. Closes giantswarm/backstage#2672.
