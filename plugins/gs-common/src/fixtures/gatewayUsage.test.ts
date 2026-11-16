import { DAY } from './builders';
import { createFixtureDataSet } from './dataSet';
import {
  counterIncreaseOf,
  FIXTURE_PERSON_EMAIL,
  gatewayDaysOf,
  gatewaySeries,
} from './gatewayUsage';

const NOW = Date.UTC(2025, 0, 1, 12);
const COST = 'agentgateway_gen_ai_client_cost_usd_total';

describe('the gateway series', () => {
  it('count back from the data set’s time, the same for the same seed and time', () => {
    const data = createFixtureDataSet({ now: NOW });
    const again = createFixtureDataSet({ now: NOW });
    expect(gatewaySeries(data, 'fennel')).toEqual(
      gatewaySeries(again, 'fennel'),
    );
    const person = gatewaySeries(data, 'fennel').filter(
      s => s.labels.__name__ === COST && s.labels.user === FIXTURE_PERSON_EMAIL,
    );
    expect(person.length).toBeGreaterThan(0);
    const spend = person.reduce(
      (sum, s) => sum + (counterIncreaseOf(s, NOW - 30 * DAY, NOW) ?? 0),
      0,
    );
    expect(spend).toBeGreaterThan(0);
  });

  it('start each series on the day of its first call, at zero', () => {
    const data = createFixtureDataSet({ now: NOW });
    const days = gatewayDaysOf(data, 'fennel', NOW).filter(
      d => d.user === FIXTURE_PERSON_EMAIL,
    );
    const first = Math.min(...days.map(d => d.day));
    const series = gatewaySeries(data, 'fennel').filter(
      s => s.labels.__name__ === COST && s.labels.user === FIXTURE_PERSON_EMAIL,
    );
    for (const s of series) {
      expect(s.points[0][1]).toBe(0);
    }
    expect(Math.min(...series.map(s => s.points[0][0]))).toBe(first);
  });

  it('give agents of the same name in different places different days', () => {
    const data = createFixtureDataSet({ now: NOW });
    const byAgent = new Map<string, string>();
    for (const installation of ['meadow', 'fennel']) {
      for (const day of gatewayDaysOf(data, installation, NOW)) {
        if (day.user === FIXTURE_PERSON_EMAIL) continue;
        const key = `${installation}/${day.namespace}/${day.agent}/${day.user}`;
        byAgent.set(key, `${byAgent.get(key) ?? ''},${day.day}:${day.input}`);
      }
    }
    const histories = [...byAgent.values()];
    expect(new Set(histories).size).toBe(histories.length);
  });
});
