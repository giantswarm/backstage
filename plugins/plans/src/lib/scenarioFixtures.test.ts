import { lengthenSlug, lengthenTitle, login } from './scenarioFixtures';

describe('scenario fixture names', () => {
  it('makes a slug exactly as long as asked, never ending in a hyphen', () => {
    for (let length = 6; length <= 300; length++) {
      const slug = lengthenSlug('hive', length);
      expect(slug).toHaveLength(length);
      expect(slug).not.toMatch(/-$/);
      expect(login(length, length)).toHaveLength(length);
    }
  });

  it('makes a title as long as asked or a little shorter, in whole words', () => {
    for (let length = 20; length <= 300; length += 7) {
      const title = lengthenTitle('Hive plans', length);
      expect(title.length).toBeLessThanOrEqual(length);
      expect(title.length).toBeGreaterThan(length - 12);
      expect(title).not.toMatch(/\s$/);
    }
  });
});
