---
'@giantswarm/backstage-plugin-platform-capabilities': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

**Enable** and **Apply changes** open a form seeded from the card's comparison, the person's
choices only. The dialog took `installation.*` from the record and every other field from the
schema's default, so Apply changes on a portal titled _Backstage_ opened with _Dev Portal_ in the
Title field and would have renamed the portal on commit. Now the form holds what the comparison
read back for every choice (`inputs.values`); a schema default is the empty field's placeholder,
marked _(default)_, and never a submitted value; the registry's facts, generated and supplied
values are not asked. Labels are the schema's titles, else the keys in words, qualified with the
group where two share one (the five switches named `enabled` read Github, Grafana, Flux, Sentry,
Tunnel); groups are `h3`/`h4` headings; a required choice without a value is marked on its field
and named next to Review, each name leading to the field.

`SectionHeader` takes an optional description: without one, the heading stands alone.
