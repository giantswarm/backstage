import { parser } from '@prometheus-io/lezer-promql';
import { enforceMatchers, QueryRefusedError } from './enforceMatchers';

const GERBIL = { cluster_id: 'gerbil' };

/** The text of every vector selector of `query`. */
function selectorsOf(query: string): string[] {
  const selectors: string[] = [];
  parser.parse(query).iterate({
    enter(node) {
      if (node.name === 'VectorSelector') {
        selectors.push(query.slice(node.from, node.to));
      }
    },
  });
  return selectors;
}

describe('enforceMatchers', () => {
  describe('rewrites', () => {
    it.each([
      ['a bare metric', 'up', 'up{cluster_id="gerbil"}'],
      [
        'a selector with matchers',
        'up{job="x"}',
        'up{job="x",cluster_id="gerbil"}',
      ],
      ['empty braces', 'up{}', 'up{cluster_id="gerbil"}'],
      ['a trailing comma', 'up{job="x",}', 'up{job="x",cluster_id="gerbil",}'],
      [
        'a selector without a metric name',
        '{__name__="up"}',
        '{__name__="up",cluster_id="gerbil"}',
      ],
      [
        'a quoted metric name',
        '{"my.metric"}',
        '{"my.metric",cluster_id="gerbil"}',
      ],
      [
        'a matrix selector',
        'rate(foo_total[5m])',
        'rate(foo_total{cluster_id="gerbil"}[5m])',
      ],
      [
        'an offset and an @',
        'foo offset 1h @ 1700000000',
        'foo{cluster_id="gerbil"} offset 1h @ 1700000000',
      ],
      [
        'a matrix with offset',
        'increase(foo[1d] offset 1d)',
        'increase(foo{cluster_id="gerbil"}[1d] offset 1d)',
      ],
      [
        'a subquery',
        'max_over_time(rate(foo[5m])[1h:5m])',
        'max_over_time(rate(foo{cluster_id="gerbil"}[5m])[1h:5m])',
      ],
      [
        'a subquery of a bare selector',
        'max_over_time(foo[1h:])',
        'max_over_time(foo{cluster_id="gerbil"}[1h:])',
      ],
      [
        'an aggregation',
        'sum by (model) (foo{a="b"})',
        'sum by (model) (foo{a="b",cluster_id="gerbil"})',
      ],
      [
        'topk with a parameter',
        'topk(5, foo)',
        'topk(5, foo{cluster_id="gerbil"})',
      ],
      [
        'a binary operation',
        'foo / on(pod) group_left bar',
        'foo{cluster_id="gerbil"} / on(pod) group_left bar{cluster_id="gerbil"}',
      ],
      [
        'set operators',
        'foo or bar unless baz',
        'foo{cluster_id="gerbil"} or bar{cluster_id="gerbil"} unless baz{cluster_id="gerbil"}',
      ],
      ['a scalar comparison', 'foo > 0', 'foo{cluster_id="gerbil"} > 0'],
      [
        'absent',
        'absent(foo{job="x"})',
        'absent(foo{job="x",cluster_id="gerbil"})',
      ],
      [
        'absent_over_time',
        'absent_over_time(foo[5m])',
        'absent_over_time(foo{cluster_id="gerbil"}[5m])',
      ],
      [
        'label_replace',
        'label_replace(foo, "dst", "$1", "src", "(.*)")',
        'label_replace(foo{cluster_id="gerbil"}, "dst", "$1", "src", "(.*)")',
      ],
      [
        'a function of several selectors',
        'histogram_quantile(0.9, sum by (le) (rate(a_bucket[5m]))) / scalar(b)',
        'histogram_quantile(0.9, sum by (le) (rate(a_bucket{cluster_id="gerbil"}[5m]))) / scalar(b{cluster_id="gerbil"})',
      ],
      [
        'a comment after the matchers',
        'foo{a="b" # why\n}',
        'foo{a="b",cluster_id="gerbil" # why\n}',
      ],
    ])('%s', (_, query, expected) => {
      expect(enforceMatchers(query, GERBIL)).toBe(expected);
    });

    it('adds every matcher, in the configured order', () => {
      expect(
        enforceMatchers('up', {
          cluster_id: 'gerbil',
          cluster_type: 'workload_cluster',
        }),
      ).toBe('up{cluster_id="gerbil",cluster_type="workload_cluster"}');
    });

    it('escapes the value', () => {
      expect(enforceMatchers('up', { cluster_id: 'a"b\\c' })).toBe(
        'up{cluster_id="a\\"b\\\\c"}',
      );
    });

    it('rewrites a series selector, as `match[]` carries it', () => {
      expect(enforceMatchers('{job=~"api.*"}', GERBIL)).toBe(
        '{job=~"api.*",cluster_id="gerbil"}',
      );
    });

    it('leaves a query without selectors as it is', () => {
      expect(enforceMatchers('vector(1) + time()', GERBIL)).toBe(
        'vector(1) + time()',
      );
    });
  });

  describe('an equal matcher already present', () => {
    it.each([
      ['double quotes', 'up{cluster_id="gerbil"}'],
      ['single quotes', "up{cluster_id='gerbil'}"],
      ['backticks', 'up{cluster_id=`gerbil`}'],
      ['a quoted label name', 'up{"cluster_id"="gerbil"}'],
      ['an escape that decodes to the value', 'up{cluster_id="g\\x65rbil"}'],
      ['the label twice', 'up{cluster_id="gerbil",cluster_id="gerbil"}'],
    ])('is kept as it is: %s', (_, query) => {
      expect(enforceMatchers(query, GERBIL)).toBe(query);
    });

    it('adds only the matchers that are missing', () => {
      expect(
        enforceMatchers('up{cluster_id="gerbil"}', {
          cluster_id: 'gerbil',
          cluster_type: 'workload_cluster',
        }),
      ).toBe('up{cluster_id="gerbil",cluster_type="workload_cluster"}');
    });
  });

  describe('another matcher on an enforced label that can select the value', () => {
    // The equality goes next to it: the selector selects the intersection,
    // which the enforced matcher alone bounds.
    it.each([
      [
        'a regex of several clusters',
        'kube_deployment_labels{cluster_id=~"golem|gerbil"}',
        'kube_deployment_labels{cluster_id=~"golem|gerbil",cluster_id="gerbil"}',
      ],
      [
        'a regex in a query of several selectors',
        'max by (node) (a{cluster_id=~"gerbil|wc1", nodepool!=""}) * on (node) b{cluster_id=~".+"}',
        'max by (node) (a{cluster_id=~"gerbil|wc1", nodepool!="",cluster_id="gerbil"}) * on (node) b{cluster_id=~".+",cluster_id="gerbil"}',
      ],
      [
        'a negative matcher of another value',
        'up{cluster_id!="golem"}',
        'up{cluster_id!="golem",cluster_id="gerbil"}',
      ],
      [
        'a negative regex that does not match the value',
        'up{cluster_id!~"golem|glean"}',
        'up{cluster_id!~"golem|glean",cluster_id="gerbil"}',
      ],
    ])('is kept, with the equality added: %s', (_, query, expected) => {
      expect(enforceMatchers(query, GERBIL)).toBe(expected);
    });
  });

  describe('refuses', () => {
    it.each([
      ['another value', 'up{cluster_id="golem"}'],
      ['another value of a quoted label name', 'up{"cluster_id"="golem"}'],
      ['a negative matcher of the value', 'up{cluster_id!="gerbil"}'],
      [
        'a regex that does not match the value',
        'up{cluster_id=~"golem|glean"}',
      ],
      ['a regex that matches only part of it', 'up{cluster_id=~"gerb"}'],
      ['a negative regex that matches the value', 'up{cluster_id!~"ger.*"}'],
      [
        'the conflict in one selector of several',
        'up / ignoring(cluster_id) up{cluster_id="golem"}',
      ],
      [
        'the conflict inside a subquery',
        'max_over_time(foo{cluster_id="golem"}[1h:5m])',
      ],
    ])('a conflicting matcher: %s', (_, query) => {
      expect(() => enforceMatchers(query, GERBIL)).toThrow(QueryRefusedError);
      expect(() => enforceMatchers(query, GERBIL)).toThrow(/conflicts/);
    });

    it.each([
      ['unbalanced parentheses', 'sum(up'],
      ['a stray token', 'up{job="x"} )'],
      [
        '`or` inside the braces, which would need a matcher per group',
        'up{a="b" or c="d"}',
      ],
      ['an empty query', ''],
    ])('a query that does not parse: %s', (_, query) => {
      expect(() => enforceMatchers(query, GERBIL)).toThrow(QueryRefusedError);
      expect(() => enforceMatchers(query, GERBIL)).toThrow(
        /could not be parsed/,
      );
    });

    it('a matcher whose string it cannot read, without quoting it', () => {
      const query = 'up{user="me\\q@example.com"}';
      expect(() => enforceMatchers(query, GERBIL)).toThrow(QueryRefusedError);
      expect(() => enforceMatchers(query, GERBIL)).not.toThrow(/example\.com/);
    });

    it('a regex it cannot evaluate', () => {
      // RE2's `\Q…\E`, which JavaScript has no equivalent of.
      expect(() =>
        enforceMatchers('up{cluster_id=~`\\Qgerbil\\E`}', GERBIL),
      ).toThrow(/cannot be evaluated/);
    });

    it('a label name that is not one', () => {
      expect(() => enforceMatchers('up', { 'cluster-id': 'x' })).toThrow(
        QueryRefusedError,
      );
    });
  });

  it('sends nothing unfiltered: every selector of a rewritten query carries the matchers', () => {
    const query =
      'sum by (agent) (increase(a_total{x="1"}[1d] offset 1d)) / on() group_left max_over_time(rate(b[5m])[1h:]) or absent(c) unless label_replace(d, "e", "$1", "f", "(.*)")';
    const selectors = selectorsOf(enforceMatchers(query, GERBIL));

    expect(selectors).toHaveLength(4);
    for (const selector of selectors) {
      expect(selector).toContain('cluster_id="gerbil"');
    }
  });

  it('returns a query unchanged without matchers, even one it could not parse', () => {
    expect(enforceMatchers('sum(up', {})).toBe('sum(up');
    expect(enforceMatchers('up{cluster_id="golem"}', {})).toBe(
      'up{cluster_id="golem"}',
    );
  });
});
