# Dependency patches

Patches in this directory are applied to `node_modules` by
[`patch-package`](https://github.com/ds300/patch-package) from the root
`postinstall` script. It runs with `--error-on-fail`, so a patch that no longer
applies **fails the install** — a dependency bump that touches patched code
surfaces immediately instead of silently dropping the fix. (Without that flag
`patch-package` only exits non-zero in CI, so a local `yarn install` would print a
red line and carry on, leaving a developer running without the fix.)

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

## `codemirror-json-schema+0.8.1.patch`

Adds a YAML block-style fallback to schema completion: when typing the first
property name in a block mapping (`ingress:\n  enabl`), the parser sees a literal
value rather than a key, so no completions were offered. Falls back to property
name completions when the schema expects an object at that position.

## `react-vtree+3.0.0.patch`

Adds `require`/`default` conditions to the package's `exports` map so the package
can be consumed outside a pure-ESM import path.
