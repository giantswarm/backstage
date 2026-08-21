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
below whenever the dependency they target is bumped, and delete a patch as soon as
its upstream fix lands.

> `yarn patch-package --create <pkg>` does not work in this repo: it does a
> pristine temp install with yarn classic, which cannot resolve our `backstage:^`
> specifiers. Edit the file under `node_modules/`, then produce the diff by hand
> in the same format (paths prefixed `a/node_modules/…` and `b/node_modules/…`)
> and verify it with a `yarn patch-package` run against a restored, unpatched
> copy of the file.

## `@apidevtools+json-schema-ref-parser+15.5.2.patch`

Adds `/* webpackIgnore: true */` to the two dynamic imports that reach Node-only
modules: `undici` in `dist/lib/resolvers/http.js` and `node:dns/promises` in
`dist/lib/util/url.js`.

Upstream writes both as `await import(someVariable)` rather than with a string
literal, deliberately, to keep the Node-only dependency out of browser module
graphs. webpack cannot statically resolve an expression import, so it reports
`Critical dependency: the request of a dependency is an expression`. The app
bundle is built with `process.env.CI = true`, which promotes warnings to errors,
so the frontend fails to compile and takes `ci/circleci: node-build` with it.
`webpackIgnore` tells webpack to leave the import alone instead of resolving it.

The patch is behaviourally inert. `webpackIgnore` only affects bundling, so under
Node the dynamic import still resolves normally, and neither call site is
reachable in a browser: `resolveUrlSafety` returns early when
`typeof window !== "undefined"`, and `createPinnedTransport` runs only when that
function returned validated addresses, which happens on the Node path alone.
That reachability argument — not just the diff context — is what makes the patch
safe, and `patch-package` cannot check it: a bump whose surrounding lines are
untouched still applies cleanly. If upstream ever relaxes those guards, this
patch turns a build-time warning into a browser runtime failure with no
compile-time signal, so re-read both call sites when bumping.

The expression imports arrived with the DNS-rebinding hardening in 15.5.1 and are
present in 15.5.2 and 16.0.0; 15.5.0 and earlier are unaffected. There is no
fixed release to bump to, and no upstream issue has been filed yet. The real fix
is for upstream to use literal specifiers or add the magic comment itself —
delete this patch as soon as that lands.

<https://github.com/APIDevTools/json-schema-ref-parser>

## `codemirror-json-schema+0.8.1.patch`

Adds a YAML block-style fallback to schema completion: when typing the first
property name in a block mapping (`ingress:\n  enabl`), the parser sees a literal
value rather than a key, so no completions were offered. Falls back to property
name completions when the schema expects an object at that position.

## `react-vtree+3.0.0.patch`

Adds `require`/`default` conditions to the package's `exports` map so the package
can be consumed outside a pure-ESM import path.
