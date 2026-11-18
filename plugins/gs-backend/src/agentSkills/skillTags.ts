import {
  exceedsTagLimit,
  isValidTag,
  MAX_TAGS,
  parseTags,
} from '@giantswarm/backstage-plugin-gs-common';

/**
 * Skill tags: frontmatter `metadata.tags`, a comma-joined string
 * (`"triage, kubernetes"`) — the Agent Skills spec allows only string values
 * in `metadata`. Each tag follows gs-common's rule, as every tag in the
 * portal does.
 */

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
 * Whether a stored `metadata.tags` reads as tags without losing any of it: a
 * comma-joined string whose every part is a tag (in any case). A YAML list,
 * or a part like `on call`, would be dropped by {@link skillTagsOf}, so
 * replacing it would lose what the form never showed.
 */
function readsCleanly(stored: unknown): boolean {
  if (stored === undefined || stored === null) {
    return true;
  }
  return (
    typeof stored === 'string' &&
    stored
      .split(',')
      .map(part => part.trim().toLowerCase())
      .filter(part => part !== '')
      .every(isValidTag)
  );
}

/** Why {@link withSkillTags} cannot write tags into a frontmatter. */
export class SkillTagsError extends Error {}

/**
 * The frontmatter with `metadata.tags` set to `tags`, comma-joined, every
 * other key (and `metadata` key) kept in place. Empty `tags` removes
 * `metadata.tags`, and `metadata` too when tags were all it held; a missing
 * `metadata` is only created for tags. Throws a {@link SkillTagsError} when
 * `metadata` is not a map, its `tags` hold what the portal cannot read
 * (see {@link readsCleanly}), or `tags` add a tag past `MAX_TAGS`
 * (`exceedsTagLimit` over the stored tags; none on create).
 */
export function withSkillTags(
  frontmatter: Record<string, unknown>,
  tags: readonly string[],
): Record<string, unknown> {
  const metadata = frontmatter.metadata;
  if (isPlainObject(metadata) && !readsCleanly(metadata.tags)) {
    throw new SkillTagsError(
      "The skill's metadata.tags is not a comma-separated list of tags, so changing it here would lose some of it. Change the tags in the repository.",
    );
  }
  // As muster checks it: past the limit only with a tag the skill lacks.
  if (exceedsTagLimit(tags, skillTagsOf(frontmatter))) {
    throw new SkillTagsError(`A skill takes at most ${MAX_TAGS} tags.`);
  }
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
    throw new SkillTagsError(
      "The skill's frontmatter metadata is not a map, so tags cannot be added to it.",
    );
  }
  return {
    ...frontmatter,
    metadata: { ...(metadata ?? {}), tags: tags.join(', ') },
  };
}
