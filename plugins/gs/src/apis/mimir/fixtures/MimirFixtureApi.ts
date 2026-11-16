import {
  FIXTURE_INSTALLATIONS,
  isFixtureInstallation,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  gatewaySeries,
  labelKey,
  type FixtureCounterSeries,
  type FixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import type {
  MimirApi,
  MimirMatrixSample,
  MimirQueryResponse,
  MimirRangeQueryResponse,
} from '../types';
import { MimirQueryError } from '../MimirQueryError';
import {
  evaluatePromql,
  formatValue,
  parseDuration,
  parsePromql,
  UnsupportedQueryError,
  type PromqlNode,
} from './promql';

/** The most points a range query answers, as Mimir limits them. */
const MAX_POINTS = 11000;

/** How many parsed queries are kept; a page sends a few dozen. */
const PARSED_LIMIT = 500;

/**
 * Mimir in fixture mode (`gs.fixtures: true`): each fixture installation's
 * agent gateway series (`gatewaySeries` in gs-common), built from the data
 * set the other fixture APIs read, so the usage pages count the agents,
 * people and model the rest of the portal shows. The queries are evaluated
 * (`promql.ts`), and need no token. A metric the data set has no series of
 * answers no series, as Mimir does; so does a query the evaluator does not
 * read, with a console warning naming what it could not read.
 */
export class MimirFixtureApi implements MimirApi {
  private readonly parsed = new Map<string, PromqlNode>();

  constructor(
    private readonly data: () => FixtureDataSet = baseDataSet,
    private readonly now: () => number = Date.now,
  ) {}

  async query(params: {
    installationName: string;
    query: string;
  }): Promise<MimirQueryResponse> {
    const series = this.seriesOf(params.installationName);
    const time = this.now() / 1000;
    const [samples = []] = this.run(params.query, series, [time]);
    return {
      status: 'success',
      data: {
        resultType: 'vector',
        result: samples.map(sample => ({
          metric: sample.labels,
          value: [time, formatValue(sample.value)],
        })),
      },
    };
  }

  async queryRange(params: {
    installationName: string;
    query: string;
    start: string;
    end: string;
    step: string;
  }): Promise<MimirRangeQueryResponse> {
    const series = this.seriesOf(params.installationName);
    const start = Number(params.start);
    const end = Number(params.end);
    const step = parseDuration(params.step);
    if (!(step > 0) || !(end >= start) || (end - start) / step > MAX_POINTS) {
      const message = `Fixture Mimir refuses the range: start ${params.start}, end ${params.end}, step ${params.step}`;
      // eslint-disable-next-line no-console
      console.error(message);
      const error = new MimirQueryError(message, { status: 400 });
      error.name = 'InputError';
      throw error;
    }
    const times: number[] = [];
    for (let time = start; time <= end; time += step) {
      times.push(time);
    }
    const result = new Map<string, MimirMatrixSample>();
    this.run(params.query, series, times).forEach((samples, index) => {
      for (const sample of samples) {
        const key = labelKey(sample.labels);
        const matrix = result.get(key) ?? { metric: sample.labels, values: [] };
        matrix.values.push([times[index], formatValue(sample.value)]);
        result.set(key, matrix);
      }
    });
    return {
      status: 'success',
      data: { resultType: 'matrix', result: [...result.values()] },
    };
  }

  /** The samples at each time; none at all for a query it cannot read. */
  private run(
    query: string,
    series: readonly FixtureCounterSeries[],
    times: readonly number[],
  ) {
    try {
      return evaluatePromql(this.parse(query), series, times);
    } catch (error) {
      if (!(error instanceof UnsupportedQueryError)) {
        throw error;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `Fixture Mimir answers no series: it cannot evaluate ${error.message}. Query: ${query}`,
      );
      return times.map(() => []);
    }
  }

  private parse(query: string): PromqlNode {
    let node = this.parsed.get(query);
    if (!node) {
      node = parsePromql(query);
      if (this.parsed.size >= PARSED_LIMIT) {
        this.parsed.clear();
      }
      this.parsed.set(query, node);
    }
    return node;
  }

  private seriesOf(installation: string): FixtureCounterSeries[] {
    if (!isFixtureInstallation(installation)) {
      const message = `Fixture mode serves no installation ${installation}, only ${FIXTURE_INSTALLATIONS.join(', ')}.`;
      // eslint-disable-next-line no-console
      console.error(message);
      const error = new MimirQueryError(message, { status: 404 });
      error.name = 'NotFoundError';
      throw error;
    }
    return gatewaySeries(this.data(), installation);
  }
}
