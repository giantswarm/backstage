---
'@giantswarm/backstage-plugin-agent-platform': patch
---

More lists stay plain at a few entries and usable at hundreds:

- Usage → Cost's by-agent table renders the top 20 agents by the active sort,
  with _Show more_.
- The Serving page's running models get a model search once more than 20 are
  listed (filtering out backends with no match), and each backend's table
  renders 20 models at a time.
- The create-agent environment step's "Sign in to muster" links wrap and show
  the first five (_Show all N environments_); its notes name the first five
  environments and count the rest.
- The Tools step's "Start from an existing agent" shows 12 agents at a time,
  with a search by name or namespace once there are more than 20.
- The agent wizard's Skills step (create and edit) shows a single repository's
  skills as a plain grid, opens every repository only while the catalogue
  holds at most 20 skills (a longer one opens as its repositories and counts,
  each counting its selected skills, and a search opens the repositories it
  matched in), renders 20 skills per grid at a time with _Show more_, and
  offers its search and selected count only above eight skills.
