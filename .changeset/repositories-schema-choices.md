---
'@giantswarm/backstage-plugin-repositories': minor
---

The Repositories plugin's declaration form -- Create repository, Edit and
Adopt -- offers the values giantswarm-repo-manager reports in `get_info`'s
`schema` instead of lists of its own.

- The catalog type and language selects, the nature radios, the add-on
  checkboxes and the visibility radios are bound to the reported
  `componentTypes`, `languages`, `flavours` and `visibilities`. The plugin
  keeps only the presentation keyed by value: labels, descriptions, the
  nature and add-on grouping. A reported value without one is offered under
  its own id; a value the manager stops reporting is no longer offered. The
  `fork` flavour is not offered: a new repository is not a fork line, and an
  existing entry that declares it keeps it.
- A preset whose catalog type, language or flavours the manager does not
  report is not offered.
- While `get_info` is asked, the form says so; when the manager could not
  read the schema, or predates it, the form shows its reason, and Create
  and the Edit and Adopt dialogs' dry run and pull request stay disabled.
  There is no built-in fallback.
- The in-memory fixture API reports a `schema`, and its validator judges
  entries against it.
