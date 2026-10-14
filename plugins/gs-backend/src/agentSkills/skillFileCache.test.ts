import { SkillFileCache } from './skillFileCache';
import { MAX_INLINE_FILE_BYTES } from './skillFiles';

describe('SkillFileCache', () => {
  it('keeps a text file with its bytes and a binary one as its verdict only', () => {
    const cache = new SkillFileCache();

    cache.put('r#c#a.md', Buffer.from('text'));
    cache.put('r#c#b.bin', Buffer.from([1, 0, 1]));

    expect(cache.get('r#c#a.md')).toEqual({
      binary: false,
      bytes: Buffer.from('text'),
    });
    expect(cache.get('r#c#b.bin')).toEqual({ binary: true });
    expect(cache.size).toEqual({ entries: 2, bytes: 4 });
  });

  it('does not keep a file over the inline cap', () => {
    const cache = new SkillFileCache();
    const large = Buffer.alloc(MAX_INLINE_FILE_BYTES + 1, 'a');

    expect(cache.put('r#c#big.csv', large)).toEqual({
      binary: false,
      bytes: large,
    });
    expect(cache.get('r#c#big.csv')).toBeUndefined();
  });

  it('evicts the least recently used files past its byte cap', () => {
    const cache = new SkillFileCache({ maxBytes: 10 });

    cache.put('a', Buffer.from('1234'));
    cache.put('b', Buffer.from('1234'));
    cache.get('a'); // a is now the most recently used
    cache.put('c', Buffer.from('1234'));

    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.size.bytes).toBe(8);
  });

  it('evicts past its entry cap and replaces an entry in place', () => {
    const cache = new SkillFileCache({ maxEntries: 2 });

    cache.put('a', Buffer.from('1'));
    cache.put('a', Buffer.from('22'));
    cache.put('b', Buffer.from('3'));
    cache.put('c', Buffer.from('4'));

    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toEqual({ entries: 2, bytes: 2 });
  });
});
