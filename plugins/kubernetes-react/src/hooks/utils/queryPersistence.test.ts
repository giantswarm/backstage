import { Query } from '@tanstack/react-query';
import {
  NON_PERSISTED_QUERY_META,
  shouldPersistQuery,
} from './queryPersistence';

function makeQuery(options: {
  status?: 'success' | 'error' | 'pending';
  meta?: Record<string, unknown>;
}): Query {
  return {
    state: { status: options.status ?? 'success' },
    meta: options.meta,
  } as unknown as Query;
}

describe('shouldPersistQuery', () => {
  it('persists an ordinary successful query', () => {
    expect(shouldPersistQuery(makeQuery({}))).toBe(true);
  });

  it('keeps the library default of not persisting unsuccessful queries', () => {
    expect(shouldPersistQuery(makeQuery({ status: 'error' }))).toBe(false);
    expect(shouldPersistQuery(makeQuery({ status: 'pending' }))).toBe(false);
  });

  it('drops a query tagged as non-persistable', () => {
    expect(
      shouldPersistQuery(makeQuery({ meta: { ...NON_PERSISTED_QUERY_META } })),
    ).toBe(false);
  });

  it('persists a query carrying unrelated meta', () => {
    expect(shouldPersistQuery(makeQuery({ meta: { label: 'x' } }))).toBe(true);
  });
});
