---
'@giantswarm/backstage-plugin-roadmap-backend': minor
---

Board reads survive restarts and are shared by every backend instance: each
person's reads are kept in the plugin's database (`roadmap_board_reads`)
instead of each instance's memory, served stale-while-revalidate as before.
A person who read the board before gets it at once after a restart or
rollout, on whichever instance serves them, and a read made with one
person's GitHub grant is never served to another. A stored read is served
however old it is while it is refreshed; reads nobody has asked for in 30
days are pruned hourly.
