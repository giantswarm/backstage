---
'@giantswarm/backstage-plugin-muster': patch
---

The connector wizard reads the governance mode muster reports as `governance` on `core_mcpserver_list` (muster-backend's `/servers`): a trusted platform pre-selects and creates with _Allow all_ again, a governed one _Recommended_. An older muster that reports none still gets _Recommended_ with the note. A stored _Block_ rule for new tools is kept, with each listed tool left Block, when the Test & Tools step writes the tools out, so _Done_ no longer loosens it to _Ask_.
