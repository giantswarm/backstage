import {
  counterValueAt,
  labelKey,
  type FixtureCounterSeries,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

/**
 * The part of PromQL the portal's queries use, evaluated over fixture
 * series:
 *
 * - selectors with matchers, ranges, `offset` and `@ <time>`;
 * - `increase`, `rate`, `min_over_time`, `max_over_time`, `avg_over_time`,
 *   `last_over_time`, `label_replace` and `histogram_quantile`;
 * - `sum`, `count`, `min`, `max` and `avg`, with `by` or `without`;
 * - `or`, `and`, `unless`, arithmetic and comparisons, between vectors with
 *   `on` or `ignoring` and `group_left` or `group_right`, or with a number.
 *
 * A query outside it fails with an {@link UnsupportedQueryError}; the
 * fixture Mimir answers it with no series and a console warning.
 *
 * The series are sampled continuously from their first point on, linear
 * between points, so a range function reads the values at the range's ends:
 * `increase` and `rate` do not extrapolate, and `avg_over_time` is the mean
 * of the two ends.
 */

type Labels = Record<string, string>;
type Sample = { labels: Labels; value: number };

type Matcher = { label: string; test: (value: string) => boolean };

/** How a binary operation between two vectors matches their samples. */
type VectorMatching = {
  /** `on`: only these labels; `ignoring`: all but these. */
  on: boolean;
  labels: string[];
  /** Which side may have many samples per match. */
  group?: 'left' | 'right';
  /** The labels a group copies from the side with one sample. */
  include: string[];
};

export type PromqlNode =
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
  | { kind: 'call'; name: string; args: PromqlNode[] }
  | {
      kind: 'aggregate';
      op: string;
      grouping?: { without: boolean; labels: string[] };
      arg: PromqlNode;
    }
  | {
      kind: 'binary';
      op: string;
      left: PromqlNode;
      right: PromqlNode;
      matching?: VectorMatching;
    };

type Value =
  { kind: 'scalar'; value: number } | { kind: 'vector'; samples: Sample[] };

/** A query, or a part of one, the evaluator does not read. */
export class UnsupportedQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedQueryError';
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

/** A PromQL duration (`30d`, `1h30m`, `300s`) or a number, in seconds. */
export function parseDuration(text: string): number {
  if (/^\d+(\.\d+)?$/.test(text)) {
    return Number(text);
  }
  const parts = [...text.matchAll(/(\d+)(ms|[smhdwy])/g)];
  if (parts.length === 0 || parts.map(p => p[0]).join('') !== text) {
    throw new UnsupportedQueryError(`bad duration: ${text}`);
  }
  return parts.reduce(
    (seconds, [, count, unit]) =>
      seconds + Number(count) * DURATION_UNITS[unit],
    0,
  );
}

type Token = {
  type: 'ident' | 'number' | 'duration' | 'string' | 'symbol';
  text: string;
};

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const patterns: [Token['type'], RegExp][] = [
    ['duration', /^\d+(ms|[smhdwy])(\d+(ms|[smhdwy]))*(?![\w.])/],
    ['number', /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/],
    ['ident', /^[a-zA-Z_:][a-zA-Z0-9_:]*/],
    ['symbol', /^(=~|!~|!=|==|>=|<=|[(){}[\],=<>/*+\-@])/],
  ];
  while (i < query.length) {
    const rest = query.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    if (rest[0] === '"' || rest[0] === "'") {
      let text = '';
      let j = 1;
      for (; j < rest.length && rest[j] !== rest[0]; j++) {
        if (rest[j] === '\\') {
          j++;
        }
        text += rest[j];
      }
      if (j >= rest.length) {
        throw new UnsupportedQueryError('unterminated string');
      }
      tokens.push({ type: 'string', text });
      i += j + 1;
      continue;
    }
    const found = patterns
      .map(([type, pattern]) => ({ type, match: pattern.exec(rest) }))
      .find(({ match }) => match);
    if (!found) {
      throw new UnsupportedQueryError(`unexpected character "${rest[0]}"`);
    }
    tokens.push({ type: found.type, text: found.match![0] });
    i += found.match![0].length;
  }
  return tokens;
}

const AGGREGATIONS = ['sum', 'count', 'min', 'max', 'avg'];
const RANGE_FUNCTIONS = [
  'increase',
  'rate',
  'min_over_time',
  'max_over_time',
  'avg_over_time',
  'last_over_time',
];
const FUNCTIONS = [...RANGE_FUNCTIONS, 'label_replace', 'histogram_quantile'];
const COMPARISONS = ['>', '<', '>=', '<=', '==', '!='];

/** A regex matcher as PromQL anchors it. */
function anchored(pattern: string): RegExp {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    throw new UnsupportedQueryError(`bad regular expression: ${pattern}`);
  }
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): PromqlNode {
    const node = this.expression();
    if (this.peek()) {
      throw new UnsupportedQueryError(`unexpected "${this.peek()!.text}"`);
    }
    return node;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.position + offset];
  }

  private next(): Token {
    const token = this.tokens[this.position++];
    if (!token) {
      throw new UnsupportedQueryError('unexpected end of query');
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
      throw new UnsupportedQueryError(
        `expected "${text}", found "${this.peek()?.text ?? 'the end'}"`,
      );
    }
  }

  /** Binary operators, loosest first, each level left-associative. */
  private static readonly LEVELS = [
    ['or'],
    ['and', 'unless'],
    COMPARISONS,
    ['+', '-'],
    ['*', '/'],
  ];

  private expression(level = 0): PromqlNode {
    if (level === Parser.LEVELS.length) {
      return this.primary();
    }
    let left = this.expression(level + 1);
    for (;;) {
      const op = Parser.LEVELS[level].find(o => this.accept(o));
      if (!op) {
        return left;
      }
      if (this.accept('bool')) {
        throw new UnsupportedQueryError('"bool" is not supported');
      }
      const matching = this.vectorMatching();
      left = {
        kind: 'binary',
        op,
        left,
        right: this.expression(level + 1),
        matching,
      };
    }
  }

  private vectorMatching(): VectorMatching | undefined {
    const on = this.accept('on');
    if (!on && !this.accept('ignoring')) {
      return undefined;
    }
    const matching: VectorMatching = {
      on,
      labels: this.labelList(),
      include: [],
    };
    for (const group of ['left', 'right'] as const) {
      if (this.accept(`group_${group}`)) {
        matching.group = group;
        matching.include = this.peek()?.text === '(' ? this.labelList() : [];
      }
    }
    return matching;
  }

  private primary(): PromqlNode {
    const token = this.peek();
    if (!token) {
      throw new UnsupportedQueryError('unexpected end of query');
    }
    if (token.type === 'number') {
      this.position++;
      return { kind: 'number', value: Number(token.text) };
    }
    if (this.accept('-')) {
      return {
        kind: 'binary',
        op: '*',
        left: { kind: 'number', value: -1 },
        right: this.primary(),
      };
    }
    if (this.accept('(')) {
      const node = this.expression();
      this.expect(')');
      return node;
    }
    if (token.type === 'ident' && AGGREGATIONS.includes(token.text)) {
      this.position++;
      let grouping = this.grouping();
      this.expect('(');
      const arg = this.expression();
      this.expect(')');
      grouping ??= this.grouping();
      return { kind: 'aggregate', op: token.text, grouping, arg };
    }
    if (token.type === 'ident' && this.peek(1)?.text === '(') {
      if (!FUNCTIONS.includes(token.text)) {
        throw new UnsupportedQueryError(
          `function "${token.text}" is not supported`,
        );
      }
      this.position += 2;
      const args: PromqlNode[] = [];
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
    throw new UnsupportedQueryError(`unexpected "${token.text}"`);
  }

  /** A function argument: an expression, or a string. */
  private argument(): PromqlNode {
    const token = this.peek();
    if (token?.type === 'string') {
      this.position++;
      return { kind: 'string', text: token.text };
    }
    return this.expression();
  }

  private grouping(): { without: boolean; labels: string[] } | undefined {
    const without = this.accept('without');
    if (!without && !this.accept('by')) {
      return undefined;
    }
    return { without, labels: this.labelList() };
  }

  private labelList(): string[] {
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
      throw new UnsupportedQueryError(
        `expected a label name, found "${token.text}"`,
      );
    }
    return token.text;
  }

  private matcher(): Matcher {
    const label = this.ident();
    const op = this.next().text;
    const value = this.next();
    if (value.type !== 'string') {
      throw new UnsupportedQueryError(
        `expected a string, found "${value.text}"`,
      );
    }
    const text = value.text;
    switch (op) {
      case '=':
        return { label, test: v => v === text };
      case '!=':
        return { label, test: v => v !== text };
      case '=~': {
        const pattern = anchored(text);
        return { label, test: v => pattern.test(v) };
      }
      case '!~': {
        const pattern = anchored(text);
        return { label, test: v => !pattern.test(v) };
      }
      default:
        throw new UnsupportedQueryError(`bad matcher operator "${op}"`);
    }
  }

  private selector(): PromqlNode {
    const name = this.peek()?.type === 'ident' ? this.next().text : undefined;
    const matchers: Matcher[] = [];
    if (this.accept('{') && !this.accept('}')) {
      do {
        matchers.push(this.matcher());
      } while (this.accept(','));
      this.expect('}');
    }
    if (name) {
      matchers.push({ label: '__name__', test: v => v === name });
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
        const token = this.next();
        at = token.type === 'number' ? Number(token.text) : NaN;
        if (!Number.isFinite(at)) {
          throw new UnsupportedQueryError(
            `"@ ${token.text}" is not supported, only "@ <unix time>"`,
          );
        }
      } else {
        break;
      }
    }
    return { kind: 'selector', name, matchers, range, offset, at };
  }
}

/** Parses a query, or throws an {@link UnsupportedQueryError}. */
export function parsePromql(query: string): PromqlNode {
  return new Parser(tokenize(query)).parse();
}

function withoutName(labels: Labels): Labels {
  const { __name__: _name, ...rest } = labels;
  return rest;
}

/** The labels vector matching compares. */
function matchedLabels(labels: Labels, matching?: VectorMatching): Labels {
  if (matching?.on) {
    return Object.fromEntries(
      matching.labels
        .filter(label => labels[label] !== undefined)
        .map(label => [label, labels[label]]),
    );
  }
  const rest = withoutName(labels);
  for (const label of matching?.labels ?? []) {
    delete rest[label];
  }
  return rest;
}

function signature(labels: Labels, matching?: VectorMatching): string {
  return labelKey(matchedLabels(labels, matching));
}

type Context = {
  series: readonly FixtureCounterSeries[];
  /** Unix seconds. */
  time: number;
  /** Each selector's series, which stay the same over a range query's steps. */
  selected: Map<PromqlNode, FixtureCounterSeries[]>;
};

const indexes = new WeakMap<
  readonly FixtureCounterSeries[],
  Map<string, FixtureCounterSeries[]>
>();

/**
 * The series by metric name, built once per array: a selector with a name
 * looks at its metric's series only, not every series the fixtures hold.
 */
function byName(
  series: readonly FixtureCounterSeries[],
): Map<string, FixtureCounterSeries[]> {
  let index = indexes.get(series);
  if (!index) {
    index = new Map();
    for (const s of series) {
      const name = s.labels.__name__ ?? '';
      const named = index.get(name);
      if (named) {
        named.push(s);
      } else {
        index.set(name, [s]);
      }
    }
    indexes.set(series, index);
  }
  return index;
}

/** The series a selector names, and the time its range ends at, in ms. */
function select(
  node: Extract<PromqlNode, { kind: 'selector' }>,
  context: Context,
): { series: FixtureCounterSeries[]; end: number } {
  let series = context.selected.get(node);
  if (!series) {
    const candidates = node.name
      ? (byName(context.series).get(node.name) ?? [])
      : context.series;
    series = candidates.filter(s =>
      node.matchers.every(m => m.test(s.labels[m.label] ?? '')),
    );
    context.selected.set(node, series);
  }
  return { series, end: ((node.at ?? context.time) - node.offset) * 1000 };
}

function vector(value: Value): Sample[] {
  if (value.kind !== 'vector') {
    throw new UnsupportedQueryError('expected an instant vector');
  }
  return value.samples;
}

function scalar(value: Value): number {
  if (value.kind !== 'scalar') {
    throw new UnsupportedQueryError('expected a number');
  }
  return value.value;
}

function rangeFunction(
  name: string,
  arg: PromqlNode | undefined,
  context: Context,
): Sample[] {
  if (arg?.kind !== 'selector' || arg.range === undefined) {
    throw new UnsupportedQueryError(`${name} expects a range vector`);
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
    const values: Record<string, number> = {
      increase: to - from,
      rate: (to - from) / arg.range,
      min_over_time: Math.min(from, to),
      max_over_time: Math.max(from, to),
      avg_over_time: (from + to) / 2,
      last_over_time: to,
    };
    samples.push({
      labels: name === 'last_over_time' ? s.labels : withoutName(s.labels),
      value: values[name],
    });
  }
  return samples;
}

function labelReplace(args: PromqlNode[], context: Context): Sample[] {
  const texts = args
    .slice(1)
    .map(arg => (arg.kind === 'string' ? arg.text : undefined));
  if (args.length !== 5 || texts.some(text => text === undefined)) {
    throw new UnsupportedQueryError(
      'label_replace expects a vector and four strings',
    );
  }
  const [destination, replacement, source, regex] = texts as string[];
  const pattern = anchored(regex);
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
    const key = labelKey(labels);
    const group = groups.get(key) ?? { labels, buckets: [] };
    group.buckets.push([le === '+Inf' ? Infinity : Number(le), sample.value]);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ labels, buckets }) => {
    if (Number.isNaN(phi)) {
      return { labels, value: NaN };
    }
    if (phi < 0) {
      return { labels, value: -Infinity };
    }
    if (phi > 1) {
      return { labels, value: Infinity };
    }
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
  node: Extract<PromqlNode, { kind: 'aggregate' }>,
  context: Context,
): Sample[] {
  const groups = new Map<string, { labels: Labels; values: number[] }>();
  const { without = false, labels: listed = [] } = node.grouping ?? {};
  for (const sample of vector(evaluate(node.arg, context))) {
    let labels: Labels = {};
    if (without) {
      labels = withoutName(sample.labels);
      for (const label of listed) {
        delete labels[label];
      }
    } else {
      for (const label of listed) {
        if (sample.labels[label]) {
          labels[label] = sample.labels[label];
        }
      }
    }
    const key = labelKey(labels);
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

function setOperation(
  op: string,
  lhs: Sample[],
  rhs: Sample[],
  matching?: VectorMatching,
): Sample[] {
  const inRight = new Set(rhs.map(s => signature(s.labels, matching)));
  if (op === 'and') {
    return lhs.filter(s => inRight.has(signature(s.labels, matching)));
  }
  if (op === 'unless') {
    return lhs.filter(s => !inRight.has(signature(s.labels, matching)));
  }
  const inLeft = new Set(lhs.map(s => signature(s.labels, matching)));
  return [
    ...lhs,
    ...rhs.filter(s => !inLeft.has(signature(s.labels, matching))),
  ];
}

/**
 * Arithmetic or a comparison between two vectors, one to one or with a
 * group: each sample of the side with many meets the one sample of the other
 * side with the same matched labels.
 */
function vectorOperation(
  op: string,
  lhs: Sample[],
  rhs: Sample[],
  matching?: VectorMatching,
): Sample[] {
  const comparison = COMPARISONS.includes(op);
  const groupRight = matching?.group === 'right';
  const [many, one] = groupRight ? [rhs, lhs] : [lhs, rhs];
  const ones = new Map<string, Sample>();
  for (const sample of one) {
    const key = signature(sample.labels, matching);
    if (ones.has(key)) {
      throw new UnsupportedQueryError(
        'many-to-many matching: more than one sample on the "one" side',
      );
    }
    ones.set(key, sample);
  }
  const results: Sample[] = [];
  const seen = new Set<string>();
  for (const sample of many) {
    const other = ones.get(signature(sample.labels, matching));
    if (!other) {
      continue;
    }
    const [left, right] = groupRight ? [other, sample] : [sample, other];
    if (comparison && !compare(op, left.value, right.value)) {
      continue;
    }
    let labels: Labels;
    if (matching?.group) {
      labels = comparison ? { ...sample.labels } : withoutName(sample.labels);
      for (const label of matching.include) {
        if (other.labels[label]) {
          labels[label] = other.labels[label];
        } else {
          delete labels[label];
        }
      }
    } else if (comparison) {
      labels = left.labels;
    } else {
      labels = matchedLabels(left.labels, matching);
    }
    const key = labelKey(labels);
    if (!matching?.group && seen.has(key)) {
      throw new UnsupportedQueryError('duplicate series in a one-to-one match');
    }
    seen.add(key);
    results.push({
      labels,
      value: comparison ? left.value : arithmetic(op, left.value, right.value),
    });
  }
  return results;
}

function binary(
  node: Extract<PromqlNode, { kind: 'binary' }>,
  context: Context,
): Value {
  const left = evaluate(node.left, context);
  const right = evaluate(node.right, context);
  if (['or', 'and', 'unless'].includes(node.op)) {
    return {
      kind: 'vector',
      samples: setOperation(
        node.op,
        vector(left),
        vector(right),
        node.matching,
      ),
    };
  }
  const comparison = COMPARISONS.includes(node.op);
  if (left.kind === 'scalar' && right.kind === 'scalar') {
    if (comparison) {
      throw new UnsupportedQueryError('a comparison of two numbers needs bool');
    }
    return {
      kind: 'scalar',
      value: arithmetic(node.op, left.value, right.value),
    };
  }
  if (left.kind === 'vector' && right.kind === 'vector') {
    return {
      kind: 'vector',
      samples: vectorOperation(
        node.op,
        left.samples,
        right.samples,
        node.matching,
      ),
    };
  }
  const samples: Sample[] = [];
  for (const sample of vector(left.kind === 'vector' ? left : right)) {
    const [a, b] =
      left.kind === 'vector'
        ? [sample.value, scalar(right)]
        : [scalar(left), sample.value];
    if (!comparison) {
      samples.push({
        labels: withoutName(sample.labels),
        value: arithmetic(node.op, a, b),
      });
    } else if (compare(node.op, a, b)) {
      samples.push(sample);
    }
  }
  return { kind: 'vector', samples };
}

function evaluate(node: PromqlNode, context: Context): Value {
  switch (node.kind) {
    case 'number':
      return { kind: 'scalar', value: node.value };
    case 'string':
      throw new UnsupportedQueryError('unexpected string');
    case 'selector': {
      if (node.range !== undefined) {
        throw new UnsupportedQueryError('a range vector needs a function');
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
 * Evaluates a parsed query at each of `times` (Unix seconds) over `series`:
 * the samples of the instant vector at each time. A query whose result is a
 * number, not a vector, is not supported.
 */
export function evaluatePromql(
  query: PromqlNode,
  series: readonly FixtureCounterSeries[],
  times: readonly number[],
): Sample[][] {
  const selected = new Map<PromqlNode, FixtureCounterSeries[]>();
  return times.map(time => {
    const value = evaluate(query, { series, time, selected });
    if (value.kind !== 'vector') {
      throw new UnsupportedQueryError(
        'a query that answers a number, not series',
      );
    }
    return value.samples;
  });
}
