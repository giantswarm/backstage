import {
  counterValueAt,
  type FixtureCounterSeries,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

/**
 * The part of PromQL the portal's queries use, evaluated over fixture
 * counter series: selectors with matchers, ranges, `offset` and `@`;
 * `increase`, `min_over_time`, `last_over_time`, `label_replace` and
 * `histogram_quantile`; `sum`, `count`, `min`, `max` and `avg`, optionally
 * `by` labels; `or`, `and`, `unless`; arithmetic and comparisons with a
 * number. Anything else is refused as Mimir refuses a query it cannot parse
 * (`InputError`), so a page that starts sending a new shape fails loudly
 * instead of reading an empty answer.
 *
 * A series is sampled continuously from its first point on, so a range
 * function reads its value at the range's ends; `increase` does not
 * extrapolate.
 */

type Labels = Record<string, string>;
type Sample = { labels: Labels; value: number };

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'string'; text: string }
  | {
      kind: 'selector';
      name?: string;
      matchers: Matcher[];
      range?: number;
      offset: number;
      at?: number;
    }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'aggregate'; op: string; by?: string[]; arg: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node };

type Matcher = { label: string; op: '=' | '!=' | '=~' | '!~'; value: string };

type Value =
  { kind: 'scalar'; value: number } | { kind: 'vector'; samples: Sample[] };

export class PromqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

const DURATION_UNITS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31536000,
};

/** A PromQL duration (`30d`, `1h30m`, `300s`) in seconds. */
export function parseDuration(text: string): number {
  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }
  const parts = [...text.matchAll(/(\d+)(ms|[smhdwy])/g)];
  if (parts.length === 0 || parts.map(p => p[0]).join('') !== text) {
    throw new PromqlError(`bad duration: ${text}`);
  }
  return parts.reduce(
    (seconds, [, count, unit]) =>
      seconds + Number(count) * DURATION_UNITS[unit],
    0,
  );
}

type Token =
  | { type: 'ident'; text: string }
  | { type: 'number'; text: string }
  | { type: 'duration'; text: string }
  | { type: 'string'; text: string }
  | { type: 'symbol'; text: string };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < query.length) {
    const rest = query.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const duration = /^\d+(ms|[smhdwy])(\d+(ms|[smhdwy]))*(?![\w.])/.exec(rest);
    if (duration) {
      tokens.push({ type: 'duration', text: duration[0] });
      i += duration[0].length;
      continue;
    }
    const number = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(rest);
    if (number) {
      tokens.push({ type: 'number', text: number[0] });
      i += number[0].length;
      continue;
    }
    const ident = /^[a-zA-Z_:][a-zA-Z0-9_:]*/.exec(rest);
    if (ident) {
      tokens.push({ type: 'ident', text: ident[0] });
      i += ident[0].length;
      continue;
    }
    if (rest[0] === '"' || rest[0] === "'") {
      const quote = rest[0];
      let text = '';
      let j = 1;
      for (; j < rest.length && rest[j] !== quote; j++) {
        if (rest[j] === '\\') {
          j++;
        }
        text += rest[j];
      }
      if (j >= rest.length) {
        throw new PromqlError('unterminated string');
      }
      tokens.push({ type: 'string', text });
      i += j + 1;
      continue;
    }
    const symbol = /^(=~|!~|!=|==|>=|<=|[(){}[\],=<>/*+\-@])/.exec(rest);
    if (symbol) {
      tokens.push({ type: 'symbol', text: symbol[0] });
      i += symbol[0].length;
      continue;
    }
    throw new PromqlError(`unexpected character "${rest[0]}"`);
  }
  return tokens;
}

const AGGREGATIONS = ['sum', 'count', 'min', 'max', 'avg'];
const FUNCTIONS = [
  'increase',
  'min_over_time',
  'last_over_time',
  'label_replace',
  'histogram_quantile',
];
const COMPARISONS = ['>', '<', '>=', '<=', '==', '!='];

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.expression();
    if (this.peek()) {
      throw new PromqlError(`unexpected "${this.peek()!.text}"`);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.tokens[this.position++];
    if (!token) {
      throw new PromqlError('unexpected end of query');
    }
    return token;
  }

  private accept(text: string): boolean {
    const token = this.peek();
    if (token && token.type !== 'string' && token.text === text) {
      this.position++;
      return true;
    }
    return false;
  }

  private expect(text: string): void {
    if (!this.accept(text)) {
      throw new PromqlError(
        `expected "${text}", found "${this.peek()?.text ?? 'the end'}"`,
      );
    }
  }

  private expression(): Node {
    let left = this.unless();
    while (this.accept('or')) {
      left = { kind: 'binary', op: 'or', left, right: this.unless() };
    }
    return left;
  }

  private unless(): Node {
    let left = this.comparison();
    for (;;) {
      const op = ['unless', 'and'].find(o => this.accept(o));
      if (!op) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.comparison() };
    }
  }

  private comparison(): Node {
    let left = this.additive();
    for (;;) {
      const op = COMPARISONS.find(o => this.accept(o));
      if (!op) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.additive() };
    }
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const op = ['+', '-'].find(o => this.accept(o));
      if (!op) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.multiplicative() };
    }
  }

  private multiplicative(): Node {
    let left = this.primary();
    for (;;) {
      const op = ['*', '/'].find(o => this.accept(o));
      if (!op) {
        return left;
      }
      left = { kind: 'binary', op, left, right: this.primary() };
    }
  }

  private primary(): Node {
    const token = this.peek();
    if (!token) {
      throw new PromqlError('unexpected end of query');
    }
    if (token.type === 'number') {
      this.position++;
      return { kind: 'number', value: Number(token.text) };
    }
    if (this.accept('(')) {
      const node = this.expression();
      this.expect(')');
      return node;
    }
    if (token.type === 'ident' && AGGREGATIONS.includes(token.text)) {
      this.position++;
      let by = this.grouping();
      this.expect('(');
      const arg = this.expression();
      this.expect(')');
      by ??= this.grouping();
      return { kind: 'aggregate', op: token.text, by, arg };
    }
    if (
      token.type === 'ident' &&
      this.tokens[this.position + 1]?.text === '('
    ) {
      if (!FUNCTIONS.includes(token.text)) {
        throw new PromqlError(`function "${token.text}" is not supported`);
      }
      this.position += 2;
      const args: Node[] = [];
      if (!this.accept(')')) {
        do {
          args.push(this.argument());
        } while (this.accept(','));
        this.expect(')');
      }
      return { kind: 'call', name: token.text, args };
    }
    if (token.type === 'ident' || token.text === '{') {
      return this.selector();
    }
    throw new PromqlError(`unexpected "${token.text}"`);
  }

  /** A function argument: an expression, or a string. */
  private argument(): Node {
    const token = this.peek();
    if (token?.type === 'string') {
      this.position++;
      return { kind: 'string', text: token.text };
    }
    return this.expression();
  }

  private grouping(): string[] | undefined {
    if (this.accept('without')) {
      throw new PromqlError('"without" is not supported');
    }
    if (!this.accept('by')) {
      return undefined;
    }
    this.expect('(');
    const labels: string[] = [];
    if (!this.accept(')')) {
      do {
        labels.push(this.ident());
      } while (this.accept(','));
      this.expect(')');
    }
    return labels;
  }

  private ident(): string {
    const token = this.next();
    if (token.type !== 'ident') {
      throw new PromqlError(`expected a label name, found "${token.text}"`);
    }
    return token.text;
  }

  private selector(): Node {
    let name: string | undefined;
    if (this.peek()?.type === 'ident') {
      name = this.next().text;
    }
    const matchers: Matcher[] = [];
    if (this.accept('{')) {
      if (!this.accept('}')) {
        do {
          const label = this.ident();
          const op = this.next().text as Matcher['op'];
          if (!['=', '!=', '=~', '!~'].includes(op)) {
            throw new PromqlError(`bad matcher operator "${op}"`);
          }
          const value = this.next();
          if (value.type !== 'string') {
            throw new PromqlError(`expected a string, found "${value.text}"`);
          }
          matchers.push({ label, op, value: value.text });
        } while (this.accept(','));
        this.expect('}');
      }
    }
    let range: number | undefined;
    if (this.accept('[')) {
      range = parseDuration(this.next().text);
      this.expect(']');
    }
    let offset = 0;
    let at: number | undefined;
    for (;;) {
      if (this.accept('offset')) {
        offset = parseDuration(this.next().text);
      } else if (this.accept('@')) {
        at = Number(this.next().text);
      } else {
        break;
      }
    }
    return { kind: 'selector', name, matchers, range, offset, at };
  }
}

/** Parses a query, or throws a {@link PromqlError}. */
export function parsePromql(query: string): Node {
  return new Parser(tokenize(query)).parse();
}

function matches(labels: Labels, matcher: Matcher): boolean {
  const value = labels[matcher.label] ?? '';
  switch (matcher.op) {
    case '=':
      return value === matcher.value;
    case '!=':
      return value !== matcher.value;
    case '=~':
      return new RegExp(`^(?:${matcher.value})$`).test(value);
    default:
      return !new RegExp(`^(?:${matcher.value})$`).test(value);
  }
}

function withoutName(labels: Labels): Labels {
  const { __name__: _name, ...rest } = labels;
  return rest;
}

/** The label set's identity, the metric name left out, as vector matching reads it. */
function signature(labels: Labels): string {
  return JSON.stringify(
    Object.entries(withoutName(labels)).sort(([a], [b]) => a.localeCompare(b)),
  );
}

type Context = { series: readonly FixtureCounterSeries[]; time: number };

/** The series a selector names, with the time its range ends at, in ms. */
function select(
  node: Extract<Node, { kind: 'selector' }>,
  context: Context,
): { series: FixtureCounterSeries[]; end: number } {
  const matchers = node.name
    ? [
        ...node.matchers,
        { label: '__name__', op: '=' as const, value: node.name },
      ]
    : node.matchers;
  return {
    series: context.series.filter(s =>
      matchers.every(m => matches(s.labels, m)),
    ),
    end: ((node.at ?? context.time) - node.offset) * 1000,
  };
}

function vector(value: Value): Sample[] {
  if (value.kind !== 'vector') {
    throw new PromqlError('expected an instant vector');
  }
  return value.samples;
}

function scalar(value: Value): number {
  if (value.kind !== 'scalar') {
    throw new PromqlError('expected a scalar');
  }
  return value.value;
}

function rangeFunction(
  name: string,
  arg: Node | undefined,
  context: Context,
): Sample[] {
  if (arg?.kind !== 'selector' || arg.range === undefined) {
    throw new PromqlError(`${name} expects a range vector`);
  }
  const { series, end } = select(arg, context);
  const start = end - arg.range * 1000;
  const samples: Sample[] = [];
  for (const s of series) {
    const first = s.points[0]?.[0];
    if (first === undefined || first > end) {
      continue;
    }
    const from = counterValueAt(s, Math.max(start, first))!;
    const to = counterValueAt(s, end)!;
    // A counter only grows: its least value in the range is the first.
    const value = { increase: to - from, min_over_time: from }[name] ?? to;
    samples.push({
      labels: name === 'last_over_time' ? s.labels : withoutName(s.labels),
      value,
    });
  }
  return samples;
}

function labelReplace(args: Node[], context: Context): Sample[] {
  const texts = args
    .slice(1)
    .map(arg => (arg.kind === 'string' ? arg.text : undefined));
  if (args.length !== 5 || texts.some(text => text === undefined)) {
    throw new PromqlError('label_replace expects a vector and four strings');
  }
  const [destination, replacement, source, regex] = texts as string[];
  const pattern = new RegExp(`^(?:${regex})$`);
  return vector(evaluate(args[0], context)).map(sample => {
    const match = pattern.exec(sample.labels[source] ?? '');
    if (!match) {
      return sample;
    }
    const value = replacement.replace(
      /\$(\d+)/g,
      (_, group) => match[Number(group)] ?? '',
    );
    const labels = { ...sample.labels };
    if (value) {
      labels[destination] = value;
    } else {
      delete labels[destination];
    }
    return { labels, value: sample.value };
  });
}

/** Prometheus' `histogram_quantile`, linear within a bucket. */
function histogramQuantile(phi: number, samples: Sample[]): Sample[] {
  const groups = new Map<
    string,
    { labels: Labels; buckets: [number, number][] }
  >();
  for (const sample of samples) {
    const { le, ...labels } = withoutName(sample.labels);
    if (le === undefined) {
      continue;
    }
    const key = signature(labels);
    const group = groups.get(key) ?? { labels, buckets: [] };
    group.buckets.push([le === '+Inf' ? Infinity : Number(le), sample.value]);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ labels, buckets }) => {
    buckets.sort(([a], [b]) => a - b);
    const total = buckets[buckets.length - 1]?.[1] ?? 0;
    if (
      buckets.length < 2 ||
      buckets[buckets.length - 1][0] !== Infinity ||
      total === 0
    ) {
      return { labels, value: NaN };
    }
    const rank = phi * total;
    const index = buckets.findIndex(([, count]) => count >= rank);
    // In the +Inf bucket: the highest finite bound.
    if (index === buckets.length - 1) {
      return { labels, value: buckets[buckets.length - 2][0] };
    }
    const [upper, count] = buckets[index];
    const [lower, below] = index > 0 ? buckets[index - 1] : [0, 0];
    return {
      labels,
      value: lower + ((upper - lower) * (rank - below)) / (count - below || 1),
    };
  });
}

function aggregate(
  node: Extract<Node, { kind: 'aggregate' }>,
  context: Context,
): Sample[] {
  const groups = new Map<string, { labels: Labels; values: number[] }>();
  for (const sample of vector(evaluate(node.arg, context))) {
    const labels: Labels = {};
    for (const label of node.by ?? []) {
      if (sample.labels[label]) {
        labels[label] = sample.labels[label];
      }
    }
    const key = signature(labels);
    const group = groups.get(key) ?? { labels, values: [] };
    group.values.push(sample.value);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ labels, values }) => {
    const sum = values.reduce((a, b) => a + b, 0);
    const value = {
      sum,
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
    }[node.op]!;
    return { labels, value };
  });
}

function arithmetic(op: string, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    default:
      return a / b;
  }
}

function compare(op: string, a: number, b: number): boolean {
  switch (op) {
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
    default:
      return a !== b;
  }
}

function binary(
  node: Extract<Node, { kind: 'binary' }>,
  context: Context,
): Value {
  const left = evaluate(node.left, context);
  const right = evaluate(node.right, context);
  if (['or', 'and', 'unless'].includes(node.op)) {
    const lhs = vector(left);
    const rhs = vector(right);
    const inRight = new Set(rhs.map(s => signature(s.labels)));
    if (node.op === 'and') {
      return {
        kind: 'vector',
        samples: lhs.filter(s => inRight.has(signature(s.labels))),
      };
    }
    if (node.op === 'unless') {
      return {
        kind: 'vector',
        samples: lhs.filter(s => !inRight.has(signature(s.labels))),
      };
    }
    const inLeft = new Set(lhs.map(s => signature(s.labels)));
    return {
      kind: 'vector',
      samples: [...lhs, ...rhs.filter(s => !inLeft.has(signature(s.labels)))],
    };
  }
  const comparison = COMPARISONS.includes(node.op);
  if (left.kind === 'scalar' && right.kind === 'scalar') {
    return {
      kind: 'scalar',
      value: comparison
        ? Number(compare(node.op, left.value, right.value))
        : arithmetic(node.op, left.value, right.value),
    };
  }
  if (left.kind === 'vector' && right.kind === 'vector') {
    const byRight = new Map(
      right.samples.map(s => [signature(s.labels), s.value]),
    );
    const samples: Sample[] = [];
    for (const sample of left.samples) {
      const other = byRight.get(signature(sample.labels));
      if (other === undefined) {
        continue;
      }
      if (comparison) {
        if (compare(node.op, sample.value, other)) samples.push(sample);
      } else {
        samples.push({
          labels: withoutName(sample.labels),
          value: arithmetic(node.op, sample.value, other),
        });
      }
    }
    return { kind: 'vector', samples };
  }
  const samples: Sample[] = [];
  for (const sample of vector(left.kind === 'vector' ? left : right)) {
    const [a, b] =
      left.kind === 'vector'
        ? [sample.value, scalar(right)]
        : [scalar(left), sample.value];
    if (comparison) {
      if (compare(node.op, a, b)) samples.push(sample);
    } else {
      samples.push({
        labels: withoutName(sample.labels),
        value: arithmetic(node.op, a, b),
      });
    }
  }
  return { kind: 'vector', samples };
}

function evaluate(node: Node, context: Context): Value {
  switch (node.kind) {
    case 'number':
      return { kind: 'scalar', value: node.value };
    case 'string':
      throw new PromqlError('unexpected string');
    case 'selector': {
      if (node.range !== undefined) {
        throw new PromqlError('a range vector needs a function');
      }
      const { series, end } = select(node, context);
      return {
        kind: 'vector',
        samples: series.flatMap(s => {
          const value = counterValueAt(s, end);
          return value === undefined ? [] : [{ labels: s.labels, value }];
        }),
      };
    }
    case 'aggregate':
      return { kind: 'vector', samples: aggregate(node, context) };
    case 'binary':
      return binary(node, context);
    default:
      switch (node.name) {
        case 'label_replace':
          return { kind: 'vector', samples: labelReplace(node.args, context) };
        case 'histogram_quantile':
          return {
            kind: 'vector',
            samples: histogramQuantile(
              scalar(evaluate(node.args[0], context)),
              vector(evaluate(node.args[1], context)),
            ),
          };
        default:
          return {
            kind: 'vector',
            samples: rangeFunction(node.name, node.args[0], context),
          };
      }
  }
}

/** A sample value as Prometheus writes it. */
export function formatValue(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

/**
 * Evaluates a parsed query at `time` (Unix seconds) over `series`: a scalar
 * or the samples of an instant vector.
 */
export function evaluatePromql(
  query: Node,
  series: readonly FixtureCounterSeries[],
  time: number,
): Value {
  return evaluate(query, { series, time });
}
