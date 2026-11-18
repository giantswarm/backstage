---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Set no text below 12px in the muster workflow pages and state badges, and drop `FactsColumn`'s own 10px override: the app now sets bui's 10px token to 12px everywhere.
