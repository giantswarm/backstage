---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Set the skill cards off from the repository heading they belong to.

On the Select skills step, each repository is a collapsible section, and bui
gives an expanded panel 4px of padding — so the first row of cards sat almost
flush against the heading and read as part of it. An expanded grid now starts
12px further down, which is more space than there is between two rows of cards,
so the heading reads as the boundary it is. Collapsed sections are unchanged:
the extra space is scoped to the expanded state, because the panel element stays
in the layout either way.

A repository whose skills all sit in subfolders opens on a subfolder heading
rather than on cards, and that heading carried a top margin of its own on top of
the panel's new space. The margin now applies only to the subfolder headings that
actually follow cards.
