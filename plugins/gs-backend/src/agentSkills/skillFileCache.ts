import { looksBinary, MAX_INLINE_FILE_BYTES } from './skillFiles';

/** The bytes the file cache holds at most, over all files. */
export const FILE_CACHE_MAX_BYTES = 32 * 1024 * 1024;

/** Files the file cache holds at most (binary markers cost no bytes). */
export const FILE_CACHE_MAX_ENTRIES = 5000;

/** A file as the cache holds it. */
export interface CachedSkillFile {
  /** The content; absent for a binary file (only the verdict is kept). */
  bytes?: Uint8Array;
  /** The content sniff's verdict. */
  binary: boolean;
}

/**
 * Small skill files by repository, commit and path — content at a commit
 * never changes, so an entry is never stale, only evicted (least recently
 * used first) to stay under {@link FILE_CACHE_MAX_BYTES}. Holds only files up
 * to the inline cap: a larger one is answered from its listed size without
 * being read. A binary file is kept as its verdict, without its bytes.
 */
export class SkillFileCache {
  private readonly entries = new Map<string, CachedSkillFile>();
  private bytes = 0;
  private readonly maxBytes: number;
  private readonly maxEntries: number;

  constructor(options: { maxBytes?: number; maxEntries?: number } = {}) {
    this.maxBytes = options.maxBytes ?? FILE_CACHE_MAX_BYTES;
    this.maxEntries = options.maxEntries ?? FILE_CACHE_MAX_ENTRIES;
  }

  /** The cached file under `key` (repository#commit#path), if any. */
  get(key: string): CachedSkillFile | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      // Re-inserting marks it most recently used.
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  /**
   * Keeps a file read under `key`, returning what was kept (also when the
   * file is too large to keep: then the verdict is returned, not stored).
   */
  put(key: string, bytes: Uint8Array): CachedSkillFile {
    const binary = looksBinary(bytes);
    const entry: CachedSkillFile = binary ? { binary } : { binary, bytes };
    if (bytes.length > MAX_INLINE_FILE_BYTES) {
      return entry;
    }
    this.delete(key);
    this.entries.set(key, entry);
    this.bytes += entry.bytes?.length ?? 0;
    while (
      (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) &&
      this.entries.size > 0
    ) {
      this.delete(this.entries.keys().next().value as string);
    }
    return entry;
  }

  /** The bytes held, for tests and diagnostics. */
  get size(): { entries: number; bytes: number } {
    return { entries: this.entries.size, bytes: this.bytes };
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      this.bytes -= entry.bytes?.length ?? 0;
      this.entries.delete(key);
    }
  }
}
