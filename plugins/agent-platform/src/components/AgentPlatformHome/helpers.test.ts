import { greeting } from './helpers';

const at = (hour: number) => new Date(2026, 9, 8, hour, 30);

describe('greeting', () => {
  it.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('at %i:30 says %s', (hour, expected) => {
    expect(greeting(at(hour))).toBe(expected);
  });

  it('names the person by the first word of their display name', () => {
    expect(greeting(at(9), '  Jane Doe ')).toBe('Good morning, Jane');
  });

  it.each([[undefined], [''], ['   ']])(
    'leaves the name out for the display name %p',
    displayName => {
      expect(greeting(at(9), displayName)).toBe('Good morning');
    },
  );
});
