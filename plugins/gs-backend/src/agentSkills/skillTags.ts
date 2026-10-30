/**
 * Skill tags: frontmatter `metadata.tags`, a comma-joined string
 * (`"triage, kubernetes"`) — the Agent Skills spec allows only string values
 * in `metadata`. The form is the one every tag in the portal has; the parse
 * and the check repeat `parseTags` / `tagProblem` in
 * plugins/ui-react/src/lib/tags.ts, which a backend cannot import. Keep them
 * in step.
 */

export const MAX_TAG_LENGTH = 63;

/** The most tags a pull request writes on one skill: a bound, not a goal. */
export const MAX_SKILL_TAGS = 50;

/** Lowercase letters and digits, single `-` between. */
export const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Whether a value is a tag as it is stored. */
export function isValidTag(tag: string): boolean {
  return tag.length <= MAX_TAG_LENGTH && TAG_PATTERN.test(tag);
}

/**
 * The tags in a stored value: split on commas, trimmed and lowercased,
 * without empties, repeats or values that are not a valid tag.
 */
export function parseTags(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(isValidTag),
    ),
  ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The tags a SKILL.md's frontmatter carries (`metadata.tags`). */
export function skillTagsOf(frontmatter: Record<string, unknown>): string[] {
  const metadata = frontmatter.metadata;
  if (!isPlainObject(metadata) || typeof metadata.tags !== 'string') {
    return [];
  }
  return parseTags(metadata.tags);
}

/**
 * The frontmatter with `metadata.tags` set to `tags`, comma-joined, every
 * other key (and `metadata` key) kept in place. Empty `tags` removes
 * `metadata.tags`, and `metadata` too when tags were all it held; a missing
 * `metadata` is only created for tags. Throws when `metadata` is not a map
 * and tags are to be written into it.
 */
export function withSkillTags(
  frontmatter: Record<string, unknown>,
  tags: readonly string[],
): Record<string, unknown> {
  const metadata = frontmatter.metadata;
  if (tags.length === 0) {
    if (!isPlainObject(metadata) || !('tags' in metadata)) {
      return frontmatter;
    }
    const { tags: _tags, ...rest } = metadata;
    if (Object.keys(rest).length === 0) {
      const { metadata: _metadata, ...without } = frontmatter;
      return without;
    }
    return { ...frontmatter, metadata: rest };
  }
  if (metadata !== undefined && metadata !== null && !isPlainObject(metadata)) {
    throw new Error('The frontmatter `metadata` is not a map');
  }
  return {
    ...frontmatter,
    metadata: { ...(metadata ?? {}), tags: tags.join(', ') },
  };
}
