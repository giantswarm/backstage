import { finiteValue, parsePromToolText } from './promText';

describe('parsePromToolText', () => {
  it('parses a vector result with inline samples', () => {
    const text = [
      'Query executed successfully.',
      'Result Type: vector',
      'Result: {outcome="error_result"} => 0.0005 @[1787992278.435]',
      '{outcome="ok"} => 0.0003 @[1787992278.435]',
    ].join('\n');

    const series = parsePromToolText(text);
    expect(series).toHaveLength(2);
    expect(series[0].labels).toEqual({ outcome: 'error_result' });
    expect(series[0].points).toEqual([{ ts: 1787992278.435, value: 0.0005 }]);
    expect(series[1].labels).toEqual({ outcome: 'ok' });
    expect(series[1].points[0].value).toBeCloseTo(0.0003);
  });

  it('parses a matrix result with samples on their own lines', () => {
    const text = [
      'Query executed successfully.',
      'Result Type: matrix',
      'Result: {outcome="error_result"} =>',
      '0 @[1787907600]',
      '0 @[1787914800]',
      '{outcome="ok"} =>',
      '4.148148148148148 @[1787907600]',
      '75.67470273291926 @[1787914800]',
    ].join('\n');

    const series = parsePromToolText(text);
    expect(series).toHaveLength(2);
    expect(series[0].points).toEqual([
      { ts: 1787907600, value: 0 },
      { ts: 1787914800, value: 0 },
    ]);
    expect(series[1].points.map(p => p.value)).toEqual([
      4.148148148148148, 75.67470273291926,
    ]);
  });

  it('parses empty label sets and multi-label series', () => {
    const text = [
      'Result Type: vector',
      'Result: {} => 52 @[1787992632.191]',
      '{mcpserver_name="gazelle-mcp-kubernetes", tool="x_kubernetes_list_pods"} => 3 @[1787992632.191]',
    ].join('\n');

    const series = parsePromToolText(text);
    expect(series[0].labels).toEqual({});
    expect(series[0].points[0].value).toBe(52);
    expect(series[1].labels).toEqual({
      mcpserver_name: 'gazelle-mcp-kubernetes',
      tool: 'x_kubernetes_list_pods',
    });
  });

  it('handles NaN and Inf sample values', () => {
    const text = [
      'Result Type: vector',
      'Result: {} => NaN @[1787992632]',
      '{a="b"} => +Inf @[1787992632]',
    ].join('\n');

    const series = parsePromToolText(text);
    expect(Number.isNaN(series[0].points[0].value)).toBe(true);
    expect(series[1].points[0].value).toBe(Infinity);
    expect(finiteValue(series[0])).toBeUndefined();
    expect(finiteValue(series[1])).toBeUndefined();
  });

  it('returns an empty array for a result without series', () => {
    expect(
      parsePromToolText('Query executed successfully.\nResult Type: vector\n'),
    ).toEqual([]);
  });
});
