import {
  type ComponentType,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { tagCounts } from '../../lib/tags';

/** Each item's tags: one entry per agent, skill, connector or workflow. */
export type TagSourceItems = readonly (readonly string[])[];

export type TagSourceProps = {
  /** Reports the items read so far; call again whenever they change. */
  onTags: (items: TagSourceItems) => void;
};

/**
 * A kind of resource that has tags, as a component that reads them and
 * renders nothing. A component, not a hook, so a source can mount the
 * providers its read needs (a plugin's query client).
 */
export type TagSource = ComponentType<TagSourceProps>;

type TagVocabulary = {
  /** Undefined until a source has reported. */
  counts: ReadonlyMap<string, number> | undefined;
  /** Registers a reader; the sources read while any is registered. */
  acquire: () => () => void;
};

/**
 * How many resources carry each tag, across every kind that has tags, so a
 * `TagsField` suggests the same vocabulary everywhere. Unset (no provider
 * mounted), each field falls back to the counts it is given.
 */
export const TagVocabularyContext = createContext<TagVocabulary | undefined>(
  undefined,
);

/** One source's slot: hands it a stable reporter for its own index. */
function SourceSlot({
  Source,
  index,
  report,
}: {
  Source: TagSource;
  index: number;
  report: (index: number, items: TagSourceItems) => void;
}) {
  const onTags = useCallback(
    (items: TagSourceItems) => report(index, items),
    [index, report],
  );
  return <Source onTags={onTags} />;
}

/**
 * Holds one tag vocabulary over `sources` (keep the array stable). The
 * sources mount only while a reader (`useTagVocabulary`, a `TagsField`) is on
 * screen, so a page without a tags field reads nothing. What they reported
 * stays when they unmount, for the next field.
 */
export function TagVocabularyProvider({
  sources,
  children,
}: {
  sources: readonly TagSource[];
  children: ReactNode;
}) {
  const [readers, setReaders] = useState(0);
  const [reported, setReported] = useState<
    Readonly<Record<number, TagSourceItems>>
  >({});

  const acquire = useCallback(() => {
    setReaders(count => count + 1);
    return () => setReaders(count => count - 1);
  }, []);
  const report = useCallback(
    (index: number, items: TagSourceItems) =>
      setReported(current => ({ ...current, [index]: items })),
    [],
  );

  const counts = useMemo(() => {
    const lists = Object.values(reported);
    return lists.length > 0
      ? tagCounts(lists.flat().map(tags => ({ tags })))
      : undefined;
  }, [reported]);
  const value = useMemo(() => ({ counts, acquire }), [counts, acquire]);

  return (
    <TagVocabularyContext.Provider value={value}>
      {readers > 0 &&
        sources.map((Source, index) => (
          <SourceSlot
            key={index}
            Source={Source}
            index={index}
            report={report}
          />
        ))}
      {children}
    </TagVocabularyContext.Provider>
  );
}

/**
 * The shared tag counts, read on demand: the provider's sources read while
 * this is mounted. Undefined when no provider is mounted or nothing is read
 * yet.
 */
export function useTagVocabulary(): ReadonlyMap<string, number> | undefined {
  const vocabulary = useContext(TagVocabularyContext);
  const acquire = vocabulary?.acquire;
  useEffect(() => acquire?.(), [acquire]);
  return vocabulary?.counts;
}

/**
 * Reports a source's items whenever their tags change, not on every render:
 * for a {@link TagSource} built on a list that is a new array each time.
 */
export function useReportTags(
  items: TagSourceItems | undefined,
  onTags: (items: TagSourceItems) => void,
) {
  const key = items ? JSON.stringify(items) : undefined;
  useEffect(() => {
    if (key !== undefined) {
      onTags(JSON.parse(key) as TagSourceItems);
    }
  }, [key, onTags]);
}
