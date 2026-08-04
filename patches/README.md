# Dependency patches

Patches in this directory are applied to `node_modules` by
[`patch-package`](https://github.com/ds300/patch-package) from the root
`postinstall` script. A patch that no longer applies **fails the install**, so a
dependency bump that touches patched code surfaces immediately rather than
silently dropping the fix.

The version in a patch filename is informational — `patch-package` warns (but
still applies the patch) when the installed version differs. Re-check the patches
below whenever the Backstage or CodeMirror dependencies are bumped, and delete a
patch as soon as its upstream fix lands.

> `yarn patch-package --create <pkg>` does not work in this repo: it does a
> pristine temp install with yarn classic, which cannot resolve our `backstage:^`
> specifiers. Edit the file under `node_modules/`, then produce the diff by hand
> in the same format (paths prefixed `a/node_modules/…` and `b/node_modules/…`)
> and verify it with a `yarn patch-package` run against a restored, unpatched
> copy of the file.

## `@backstage/plugin-catalog+2.0.7.patch`

Makes the entity page's header tab hrefs absolute.

`useEntityTabs`/`buildHeaderTabs` build them relative (`''`, `'deployments'`, …).
The bui `Header` renders them through react-aria's `RouterProvider`, which
resolves them with react-router's `useHref` — and react-router 7 resolves a
relative link inside a splat route (the entity page is mounted at
`/catalog/:namespace/:kind/:name/*`) against the **full current pathname**, not
the route's base. So on any tab other than Overview, every tab href gains the
active tab segment (`…/my-component/circleci/deployments`), and Overview's `''`
resolves to the current URL — clicking it does nothing.

The patch resolves each href against the entity's own base path (current pathname
minus the matched splat remainder). Upstream still emits relative hrefs on
`master`, so this cannot be dropped until that changes. Our own plugin pages
avoid the same trap in `packages/app/src/modules/app/GSPageLayout.tsx`, which
absolutizes `SubPageBlueprint` tab hrefs via `useSplatBasePath()`.

## `codemirror-json-schema+0.8.1.patch`

Adds a YAML block-style fallback to schema completion: when typing the first
property name in a block mapping (`ingress:\n  enabl`), the parser sees a literal
value rather than a key, so no completions were offered. Falls back to property
name completions when the schema expects an object at that position.

## `react-vtree+3.0.0.patch`

Adds `require`/`default` conditions to the package's `exports` map so the package
can be consumed outside a pure-ESM import path.
