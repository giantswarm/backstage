import { createContext, useContext } from 'react';

/**
 * How many resources carry each tag, across every kind that has tags, so a
 * `TagsField` suggests the same vocabulary everywhere. Unset (no provider
 * mounted), each field falls back to the counts it is given.
 */
export const TagVocabularyContext = createContext<
  ReadonlyMap<string, number> | undefined
>(undefined);

/** The shared tag counts, or undefined when no provider is mounted. */
export function useTagVocabulary(): ReadonlyMap<string, number> | undefined {
  return useContext(TagVocabularyContext);
}
