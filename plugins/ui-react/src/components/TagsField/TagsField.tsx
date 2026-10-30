import {
  type FocusEvent,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Flex, Tag, TagGroup, Text, TextField } from '@backstage/ui';

import { fieldErrorProps } from '../FieldValidation';
import {
  draftProblem,
  normalizeTag,
  similarExistingTag,
  splitTyped,
  suggestTags,
  tagProblem,
} from '../../lib/tags';
import { useTagVocabulary } from './TagVocabularyContext';

/**
 * At most this many existing tags are offered at once: what is typed narrows
 * them, so a fleet with hundreds of tags still gets one short row.
 */
const MAX_SUGGESTIONS = 8;

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

export type TagsFieldProps = {
  tags: readonly string[];
  /**
   * What is typed and not added yet (form state, so an invalid draft blocks
   * Continue).
   */
  draft: string;
  /** The draft's problem once the form shows its errors. */
  error: string | undefined;
  /**
   * How many resources carry each tag; a mounted `TagVocabularyContext`
   * takes precedence.
   */
  counts?: ReadonlyMap<string, number>;
  onDraftChange: (draft: string) => void;
  onAdd: (tags: string[]) => void;
  onRemove: (tag: string) => void;
};

/**
 * A form's tags: a field where Enter, a comma or leaving it adds what was
 * typed as tags, normalized (`On Call` is `on-call`), and the tags so far
 * beneath it, each removable. While typing, the tags already in use are
 * offered as a row to click, the most used first. A new tag close to an
 * existing one gets a hint that swaps it in. Text that cannot be a tag stays
 * in the field with the reason under it.
 */
export function TagsField({
  tags,
  draft,
  error,
  counts: ownCounts = NO_COUNTS,
  onDraftChange,
  onAdd,
  onRemove,
}: TagsFieldProps) {
  const counts = useTagVocabulary() ?? ownCounts;
  // The draft's problem shows at once after a failed add, else only once the
  // form reveals its errors.
  const [attempted, setAttempted] = useState(false);
  /** A tag just added that looks like an existing one, and that one. */
  const [hint, setHint] = useState<{ added: string; existing: string }>();
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () =>
      draft.trim()
        ? suggestTags(counts, draft, tags).slice(0, MAX_SUGGESTIONS)
        : [],
    [counts, draft, tags],
  );

  const add = (added: string[]) => {
    const fresh = [...new Set(added)].filter(tag => !tags.includes(tag));
    if (fresh.length === 0) {
      return;
    }
    onAdd(fresh);
    const last = fresh[fresh.length - 1];
    const existing = similarExistingTag(last, counts, tags);
    setHint(existing ? { added: last, existing } : undefined);
  };

  /**
   * Adds the parts of `text` that can be tags; the rest stays as the draft,
   * followed by `rest` (what is still being typed after a comma), if any.
   */
  const commit = (text: string, rest?: string) => {
    const parts = splitTyped(text);
    const invalid = parts.filter(part => tagProblem(normalizeTag(part)));
    add(parts.map(normalizeTag).filter(tag => tagProblem(tag) === undefined));
    const kept = invalid.join(', ');
    if (rest === undefined) {
      onDraftChange(kept);
    } else {
      onDraftChange(kept ? `${kept}, ${rest.trimStart()}` : rest);
    }
    setAttempted(invalid.length > 0);
  };

  const onChange = (value: string) => {
    if (value.includes(',')) {
      const last = value.lastIndexOf(',');
      commit(value.slice(0, last), value.slice(last + 1));
      return;
    }
    setAttempted(false);
    onDraftChange(value);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(draft);
    }
  };

  const onBlur = (event: FocusEvent) => {
    // Picking a suggestion is not leaving the field with what is typed.
    if (suggestionsRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    if (draft.trim()) {
      commit(draft);
    }
  };

  const pick = (tag: string) => {
    add([tag]);
    setAttempted(false);
    onDraftChange('');
  };

  const swap = () => {
    if (!hint) {
      return;
    }
    onRemove(hint.added);
    onAdd([hint.existing]);
    setHint(undefined);
  };

  return (
    <Flex direction="column" gap="2">
      <TextField
        label="Tags"
        secondaryLabel="optional"
        value={draft}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        placeholder="e.g. util"
        description="Press Enter to add."
        {...fieldErrorProps(attempted ? draftProblem(draft) : error)}
      />
      {suggestions.length > 0 && (
        <div ref={suggestionsRef}>
          <TagGroup aria-label="Suggested tags">
            {suggestions.map(tag => (
              <Tag key={tag} id={tag} size="small" onAction={() => pick(tag)}>
                {tag}
              </Tag>
            ))}
          </TagGroup>
        </div>
      )}
      {hint && (
        <Text as="p" variant="body-small" color="secondary">
          Existing:{' '}
          <Button variant="tertiary" size="small" onPress={swap}>
            {hint.existing}
          </Button>
        </Text>
      )}
      {tags.length > 0 && (
        <TagGroup
          aria-label="Tags"
          onRemove={keys =>
            keys.forEach(key => {
              onRemove(String(key));
              if (hint?.added === key) {
                setHint(undefined);
              }
            })
          }
        >
          {tags.map(tag => (
            <Tag key={tag} id={tag} size="small">
              {tag}
            </Tag>
          ))}
        </TagGroup>
      )}
    </Flex>
  );
}
