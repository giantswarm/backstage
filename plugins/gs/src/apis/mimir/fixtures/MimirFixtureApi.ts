import {
  FIXTURE_INSTALLATIONS,
  isFixtureInstallation,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  baseDataSet,
  gatewaySeries,
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
} from './promql';

/** The most points a range query answers, as Mimir limits them. */
const MAX_POINTS = 11000;

/**
 * Mimir in fixture mode (`gs.fixtures: true`): each fixture installation's
 * agent gateway series (`gatewaySeriesOf` in gs-common), built from the data
 * set the other fixture APIs read, so the usage pages count the agents,
 * people and model the rest of the portal shows. The queries are evaluated
 * (`promql.ts`): a metric the data set has no series of answers an empty
 * vector, as Mimir does; a query the evaluator cannot read fails as Mimir
 * fails a bad query, with a console error.
 */
export class MimirFixtureApi implements MimirApi {
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
    const value = this.run(params.query, series, time);
    if (value.kind === 'scalar') {
      return {
        status: 'success',
        data: { resultType: 'scalar', result: [] },
      };
    }
    return {
      status: 'success',
      data: {
        resultType: 'vector',
        result: value.samples.map(sample => ({
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
      throw this.refuse(
        `bad range: start ${params.start}, end ${params.end}, step ${params.step}`,
      );
    }
    const result = new Map<string, MimirMatrixSample>();
    for (let time = start; time <= end; time += step) {
      const value = this.run(params.query, series, time);
      if (value.kind !== 'vector') {
        continue;
      }
      for (const sample of value.samples) {
        const key = JSON.stringify(
          Object.entries(sample.labels).sort(([a], [b]) => a.localeCompare(b)),
        );
        const matrix = result.get(key) ?? { metric: sample.labels, values: [] };
        matrix.values.push([time, formatValue(sample.value)]);
        result.set(key, matrix);
      }
    }
    return {
      status: 'success',
      data: { resultType: 'matrix', result: [...result.values()] },
    };
  }

  private run(
    query: string,
    series: readonly FixtureCounterSeries[],
    time: number,
  ) {
    try {
      return evaluatePromql(parsePromql(query), series, time);
    } catch (error) {
      throw this.refuse(
        `Fixture Mimir cannot evaluate the query: ${(error as Error).message}. Query: ${query}`,
      );
    }
  }

  private refuse(message: string): MimirQueryError {
    // eslint-disable-next-line no-console
    console.error(message);
    const error = new MimirQueryError(message, { status: 400 });
    error.name = 'InputError';
    return error;
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
