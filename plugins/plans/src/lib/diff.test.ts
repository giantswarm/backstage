import { parsePatch } from './diff';

describe('parsePatch', () => {
  it('numbers added, removed, and context lines per hunk', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' # Title',
      '-old line',
      '+new line',
      '+another line',
      ' trailing',
      '@@ -10,2 +11,2 @@ ## Section',
      ' context',
      '-gone',
      '+here',
    ].join('\n');

    expect(parsePatch(patch)).toEqual([
      { type: 'hunk', text: '@@ -1,3 +1,4 @@' },
      { type: 'context', text: '# Title', oldLine: 1, newLine: 1 },
      { type: 'del', text: 'old line', oldLine: 2 },
      { type: 'add', text: 'new line', newLine: 2 },
      { type: 'add', text: 'another line', newLine: 3 },
      { type: 'context', text: 'trailing', oldLine: 3, newLine: 4 },
      { type: 'hunk', text: '@@ -10,2 +11,2 @@ ## Section' },
      { type: 'context', text: 'context', oldLine: 10, newLine: 11 },
      { type: 'del', text: 'gone', oldLine: 11 },
      { type: 'add', text: 'here', newLine: 12 },
    ]);
  });
});
