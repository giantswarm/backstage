/*
 * Shared Jest setup, wired into every workspace project through the "jest"
 * field in the root package.json.
 *
 * The Backstage CLI merges a package's own "jest" field over the root one with
 * Object.assign, so a package that declares its own `setupFiles` replaces this
 * file rather than adding to it -- list it alongside the new entry if you ever
 * need one.
 */

// jsdom 29 replaced its CSSOM implementation with webidl2js wrappers around the
// css-tree parser, which has two consequences for our jsdom test environment.

// 1. `CSS.escape` is generated with an interface-style brand check, even though
//    `CSS` is a WebIDL namespace whose operations are plain functions in real
//    browsers. jss (pulled in by Material-UI v4) caches the function at module
//    load time and calls it detached, which now throws "'escape' called on an
//    object that is not a valid instance of CSS." and breaks every render of a
//    component using `makeStyles`. Binding it back to `CSS` restores the
//    browser behaviour. Fixed upstream in jsdom#4228, but not in a release yet
//    (30.0.1 is the latest); drop this once a jsdom carrying the fix is out.
if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
  CSS.escape = CSS.escape.bind(CSS);
}

// 2. css-tree rejects the nested selectors in @backstage/ui's stylesheets
//    (jsdom#4132, "Implement CSS Nesting"), so every suite that transitively
//    loads them reports a "Could not parse CSS stylesheet" jsdomError. The
//    rules jsdom does understand are still applied, so this is pure noise --
//    and enough of it to blow past CircleCI's 400KB per-step log limit, which
//    is how the real failure of this suite went unreadable in the first place.
//    Drop those two log lines only; every other console.error stays visible.
const CSS_PARSING_MESSAGE = 'Could not parse CSS stylesheet';

function isCssParsingNoise(args) {
  if (args.length !== 1) {
    return false;
  }
  const [arg] = args;
  // The Jest jsdom environment logs the error object itself...
  if (typeof arg === 'object' && arg !== null && arg.type === 'css-parsing') {
    return true;
  }
  // ...and jsdom's VirtualConsole.forwardTo logs its bare message as well.
  return arg === CSS_PARSING_MESSAGE;
}

const consoleError = console.error;
console.error = function filteredError(...args) {
  if (isCssParsingNoise(args)) {
    return;
  }
  consoleError.apply(this, args);
};
