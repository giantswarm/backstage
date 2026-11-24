import type { SyntaxNode, Tree } from '@lezer/common';
import { parser } from '@prometheus-io/lezer-promql';

/**
 * Label matchers an installation's queries must carry, as label name to
 * value: `{ cluster_id: 'gerbil' }`.
 */
export type EnforcedMatchers = Record<string, string>;

/**
 * A query {@link enforceMatchers} would not send: the message says why, for
 * the person who reads it.
 */
export class QueryRefusedError extends Error {
  constructor(reason: string) {
    super(`the query was refused: ${reason}`);
    this.name = 'QueryRefusedError';
  }
}

/** Why a selector cannot carry the matchers; {@link refuse} words it. */
class SelectorError extends Error {}

/** A Prometheus label name, as a matcher's name and as a config key here. */
const LABEL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** The matcher nodes of a `LabelMatchers` list; the rest is punctuation. */
const MATCHER_NODES = new Set([
  'UnquotedLabelMatcher',
  'QuotedLabelMatcher',
  // `{"my.metric"}`: the metric name, quoted, without an operator.
  'QuotedLabelName',
]);

/**
 * Whether `name` can be enforced: a plain Prometheus label name. The injected
 * matcher is written unquoted, so a name outside this form is refused when the
 * configuration is read rather than spliced into a query.
 */
export function isLabelName(name: string): boolean {
  return LABEL_NAME.test(name);
}

const SIMPLE_ESCAPES: Record<string, string> = {
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
};

/**
 * A PromQL string literal's value: Go's `strconv.Unquote`, which Prometheus
 * uses. Throws on an escape it does not know, which the caller refuses.
 */
function decodeStringLiteral(literal: string): string {
  const quote = literal[0];
  const body = literal.slice(1, -1);
  if (quote === '`') {
    return body;
  }
  let result = '';
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char !== '\\') {
      result += char;
      continue;
    }
    const next = body[++i];
    if (next in SIMPLE_ESCAPES) {
      result += SIMPLE_ESCAPES[next];
    } else if (next === 'x' || next === 'u' || next === 'U') {
      const length = { x: 2, u: 4, U: 8 }[next];
      const hex = body.slice(i + 1, i + 1 + length);
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== length) {
        throw new Error(`invalid escape in ${literal}`);
      }
      result += String.fromCodePoint(parseInt(hex, 16));
      i += length;
    } else if (next !== undefined && /[0-7]/.test(next)) {
      const octal = body.slice(i, i + 3);
      if (!/^[0-7]{3}$/.test(octal)) {
        throw new Error(`invalid escape in ${literal}`);
      }
      result += String.fromCharCode(parseInt(octal, 8));
      i += 2;
    } else {
      throw new Error(`invalid escape in ${literal}`);
    }
  }
  return result;
}

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    result.push(child);
  }
  return result;
}

function hasError(tree: Tree): boolean {
  let found = false;
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        found = true;
      }
      return !found;
    },
  });
  return found;
}

function vectorSelectors(tree: Tree): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === 'VectorSelector') {
        result.push(node.node);
      }
    },
  });
  return result;
}

interface LabelMatcher {
  name: string;
  op: string;
  value: string;
}

/** A matcher node of a `LabelMatchers` list, read; `undefined` for the metric name. */
function readMatcher(
  query: string,
  node: SyntaxNode,
): LabelMatcher | undefined {
  if (node.name === 'QuotedLabelName') {
    return undefined;
  }
  const text = (child: SyntaxNode | null) =>
    child ? query.slice(child.from, child.to) : '';
  const nameNode =
    node.getChild('LabelName') ??
    node.getChild('QuotedLabelName')?.getChild('StringLiteral') ??
    null;
  const rawName = text(nameNode);
  const name =
    nameNode?.name === 'StringLiteral' ? decodeStringLiteral(rawName) : rawName;
  const op = text(node.getChild('MatchOp'));
  const value = decodeStringLiteral(text(node.getChild('StringLiteral')));
  return { name, op, value };
}

/**
 * Whether `matcher` selects a series whose label is `value`. A Prometheus
 * regex is anchored at both ends and is RE2: one that JavaScript cannot
 * compile with the same meaning is refused.
 */
function selectsValue(
  matcher: LabelMatcher,
  value: string,
  text: string,
): boolean {
  switch (matcher.op) {
    case '=':
      return matcher.value === value;
    case '!=':
      return matcher.value !== value;
    case '=~':
    case '!~': {
      let regex: RegExp;
      try {
        regex = new RegExp(`^(?:${matcher.value})$`, 'u');
      } catch {
        throw new SelectorError(
          `the regex of the matcher ${text} cannot be evaluated`,
        );
      }
      return regex.test(value) === (matcher.op === '=~');
    }
    default:
      throw new SelectorError(`the matcher ${text} has an unknown operator`);
  }
}

function matcherText(name: string, value: string): string {
  return `${name}=${JSON.stringify(value)}`;
}

interface Insertion {
  at: number;
  text: string;
}

/**
 * The insertions that make one selector carry every enforced matcher.
 *
 * A matcher the selector already has on an enforced label stays, and the
 * enforced equality is added beside it unless it is that very equality: the
 * selector then selects the intersection, never more than the enforced
 * matchers allow. A matcher that cannot select the enforced value (another
 * value, `!=` that value, a regex that does not match it) would leave the
 * query answering nothing, which reads as no data rather than as a mistake,
 * so it is refused, as is a regex this cannot evaluate.
 */
function selectorInsertions(
  query: string,
  selector: SyntaxNode,
  matchers: EnforcedMatchers,
): Insertion[] {
  const labelMatchers = selector.getChild('LabelMatchers');
  const existing = labelMatchers
    ? children(labelMatchers).filter(child => MATCHER_NODES.has(child.name))
    : [];

  const present = new Set<string>();
  for (const node of existing) {
    let matcher: LabelMatcher | undefined;
    try {
      matcher = readMatcher(query, node);
    } catch {
      // Not quoted: the matcher can be any of the query's, a person's name
      // among them.
      throw new SelectorError(
        'one of its matchers has a string it cannot read',
      );
    }
    if (!matcher || !Object.hasOwn(matchers, matcher.name)) {
      continue;
    }
    const enforced = matchers[matcher.name];
    const text = query.slice(node.from, node.to);
    if (matcher.op === '=' && matcher.value === enforced) {
      present.add(matcher.name);
      continue;
    }
    if (!selectsValue(matcher, enforced, text)) {
      throw new SelectorError(
        `the matcher ${text} conflicts with the enforced ${matcherText(matcher.name, enforced)}`,
      );
    }
  }

  const missing = Object.entries(matchers)
    .filter(([name]) => !present.has(name))
    .map(([name, value]) => matcherText(name, value));
  if (missing.length === 0) {
    return [];
  }

  if (!labelMatchers) {
    // `foo` becomes `foo{…}`: a selector without braces is a metric name.
    return [{ at: selector.to, text: `{${missing.join(',')}}` }];
  }
  const last = existing[existing.length - 1];
  if (!last) {
    // `foo{}`: right after the opening brace.
    return [{ at: labelMatchers.from + 1, text: missing.join(',') }];
  }
  // After the last matcher, so that a trailing comma or a comment before the
  // closing brace stays where it was.
  return [{ at: last.to, text: `,${missing.join(',')}` }];
}

/** Whether every selector of `query` carries every one of `matchers`. */
function isEnforced(query: string, matchers: EnforcedMatchers): boolean {
  const tree = parser.parse(query);
  if (hasError(tree)) {
    return false;
  }
  try {
    return vectorSelectors(tree).every(
      selector => selectorInsertions(query, selector, matchers).length === 0,
    );
  } catch {
    return false;
  }
}

function refuse(reason: string): never {
  throw new QueryRefusedError(reason);
}

/**
 * `query` with `matchers` added to every vector and matrix selector it
 * contains, wherever it sits: inside functions, aggregations, binary
 * operations, subqueries and offsets. This is what prom-label-proxy does in
 * front of Prometheus, here in the one place every query of an installation
 * passes through.
 *
 * A query is refused (`QueryRefusedError`) rather than sent unfiltered when it does
 * not parse, or when a selector already carries a matcher on an enforced
 * label that cannot select the enforced value. The rewritten query is parsed again
 * and every selector checked, so that a mistake here is a refusal too.
 *
 * Without matchers the query is returned as it came.
 */
export function enforceMatchers(
  query: string,
  matchers: EnforcedMatchers,
): string {
  if (Object.keys(matchers).length === 0) {
    return query;
  }
  for (const name of Object.keys(matchers)) {
    if (!isLabelName(name)) {
      refuse(`"${name}" is not a label name`);
    }
  }

  const tree = parser.parse(query);
  if (hasError(tree)) {
    refuse("it could not be parsed to add the installation's matchers");
  }

  let insertions: Insertion[];
  try {
    insertions = vectorSelectors(tree).flatMap(selector =>
      selectorInsertions(query, selector, matchers),
    );
  } catch (error) {
    if (error instanceof SelectorError) {
      refuse(error.message);
    }
    throw error;
  }

  let rewritten = query;
  for (const { at, text } of [...insertions].sort((a, b) => b.at - a.at)) {
    rewritten = rewritten.slice(0, at) + text + rewritten.slice(at);
  }

  if (!isEnforced(rewritten, matchers)) {
    refuse("the installation's matchers could not be added to it");
  }

  return rewritten;
}
