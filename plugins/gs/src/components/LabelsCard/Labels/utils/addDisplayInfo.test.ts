import { addDisplayInfo } from './addDisplayInfo';
import { Label, LabelConfig } from './types';

describe('addDisplayInfo', () => {
  it('should set formattedKey from config.key', () => {
    const labels: Label[] = [{ key: 'env', value: 'prod' }];
    const config: LabelConfig[] = [{ label: 'env', key: 'Environment' }];
    const result = addDisplayInfo(labels, config);
    expect(result[0].formattedKey).toBe('Environment');
  });

  it('should set formattedValue from config.valueMap', () => {
    const labels: Label[] = [{ key: 'priority', value: '1' }];
    const config: LabelConfig[] = [
      {
        label: 'priority',
        valueMap: { '2': 'High', '1': 'Medium', '0': 'Low' },
      },
    ];
    const result = addDisplayInfo(labels, config);
    expect(result[0].formattedValue).toBe('Medium');
  });

  it('should fallback to original value if valueMap does not contain the value', () => {
    const labels: Label[] = [{ key: 'priority', value: '3' }];
    const config: LabelConfig[] = [
      {
        label: 'priority',
        valueMap: { '2': 'High', '1': 'Medium', '0': 'Low' },
      },
    ];
    const result = addDisplayInfo(labels, config);
    expect(result[0].formattedValue).toBe('3');
  });

  it('should set variant from config.variant', () => {
    const labels: Label[] = [{ key: 'priority', value: '1' }];
    const config: LabelConfig[] = [
      {
        label: 'priority',
        variant: 'warning',
      },
    ];
    const result = addDisplayInfo(labels, config);
    expect(result[0].variant).toBe('warning');
  });

  it('should set formattedKey, formattedValue and variant if all are present in config', () => {
    const labels: Label[] = [{ key: 'priority', value: '1' }];
    const config: LabelConfig[] = [
      {
        label: 'priority',
        key: 'Priority',
        valueMap: { '2': 'High', '1': 'Medium', '0': 'Low' },
        variant: 'warning',
      },
    ];
    const result = addDisplayInfo(labels, config);
    expect(result[0].formattedKey).toBe('Priority');
    expect(result[0].formattedValue).toBe('Medium');
    expect(result[0].variant).toBe('warning');
  });

  it('should process multiple labels independently', () => {
    const labels: Label[] = [
      { key: 'env', value: 'prod' },
      { key: 'priority', value: '1' },
    ];
    const config: LabelConfig[] = [
      { label: 'env', key: 'Environment' },
      {
        label: 'priority',
        valueMap: { '2': 'High', '1': 'Medium', '0': 'Low' },
      },
    ];
    const result = addDisplayInfo(labels, config);
    expect(result[0].formattedKey).toBe('Environment');
    expect(result[1].formattedValue).toBe('Medium');
  });

  it('should use original key and value if no config matches', () => {
    const labels: Label[] = [{ key: 'foo', value: 'bar' }];
    const config: LabelConfig[] = [{ label: 'other' }];
    const result = addDisplayInfo(labels, config);
    expect(result[0].formattedKey).toBe('foo');
    expect(result[0].formattedValue).toBe('bar');
    expect(result[0].variant).toBeUndefined();
  });
});
