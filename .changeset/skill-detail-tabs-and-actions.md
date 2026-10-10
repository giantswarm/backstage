---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

A skill's page takes the Agent page's shape. Its actions — Edit, View source
and Evaluate (now the primary button) — sit at the header's right as buttons,
as on an agent, and the description moved from the header into the page. Three
routed tabs: Overview (what the skill is for, its source, path, branch and
pinned commit beside it), Instructions (`…/instructions`: the SKILL.md body
rendered as Markdown — GFM, no raw HTML, images as links rather than remote
loads, relative links resolved into the skill's folder at its pinned commit;
offered only when the portal can read the file) and Used by (`…/used-by`, the
windowed list of agents, with its count on the tab). Page views of the two tabs
report `view: 'instructions' | 'used-by'`.

`ShellPage` gains `tabsBasePath` and `RouteTabs` `basePath`, for a page whose
own address is part of its route's splat.
