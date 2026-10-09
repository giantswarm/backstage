---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Agents list: a Harness column and a Harness filter beside the search box ("All Harnesses" by default, kept in the URL), both shown once agents run on more than one Harness; the search also matches the Harness name. The agent's Status card reads its Harness and shows the limits a Claude Code Harness sets (budget per turn and max turns), nothing when it sets none or cannot be read. The create wizard shows the same limits read-only for a Claude Code Harness, the platform default included, under the runtime picker and on the review step, and says they are set on the Harness and apply to every agent on it. The usage tab shows a "Reported cost" beside "Est. cost", in the totals strip and as a column of the By agent table, when an agent's runtime reported a cost for its turns; a runtime that reports none shows no figure rather than $0.00.
