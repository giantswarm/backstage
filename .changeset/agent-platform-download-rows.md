---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Downloads are rows of the served-models table on the Serving view instead of
the "Model downloads" card under it. A pull in flight renders where its model
will land — the pulled reference as the name, `Downloading` with the backend's
progress message and figures (`pulling 6f7f… · 31 % · 114 MiB / 381 MiB`) and a
progress bar as the status, Cancel in its actions menu — sorted among its
future neighbours in the installation's group; a failed pull stays as a
`Not ready` row with the failure in the status cell and Retry / Dismiss in its
menu until dismissed (remembered per tab); a finished or cancelled pull leaves
the table at once, its model appearing as the row it is. On KServe
installations the row carries the download's node once model-manager reports
it on the job. `PullJobsPanel` is removed.
