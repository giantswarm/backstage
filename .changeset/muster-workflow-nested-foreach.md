---
'@giantswarm/backstage-plugin-muster': minor
---

The workflow page draws the muster Workflow CRD's newer step fields. A loop inside a loop is drawn inside it on the flow and indented in the phone step list, its steps numbered on (1.2.1). Each loop says how many items run at once ("up to 8 at once", "one at a time", or "in order" when the definition sets no parallelism). A paginated tool step carries a "Paginated, up to 100 pages" marker and a step that reshapes its result with jq a "jq transform" marker; the step's details name the page bound (`maxPages`) and show the jq program as written. The page header and the Workflows list count the tool steps at every depth and name the loops ("8 tool steps in 2 nested loops"), and a plain list of steps still reads "3 steps". Fields the page does not know are left out rather than breaking it.
