---
'@giantswarm/backstage-plugin-repositories': minor
---

Create repository asks one question -- _What are you creating?_ -- as a
compact grid of presets, and shows the declaration as that preset's result:
one line (`service · go · app · CircleCI config generated`) with **Adjust**
opening the raw controls for a shape no preset fits; the controls open by
themselves when the manager refuses one of the fields. Component type is
labelled as the catalog type it is. Flavours are a nature -- one of app,
generic, cli, customer, fleet -- and add-ons (cluster-app, only with app;
k8sapi), each saying what devctl generates for it; cli is held to Go as
devctl's Makefile generator holds it, and helmchart, which devctl's
generators refuse, is no longer offered.
