import { Avatar, Flex } from '@backstage/ui';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { stopRowPress } from '../../utils/rowPress';

export type UserEntityLinkProps = {
  /** The person's catalog entity, e.g. `user:default/<github-login>`. */
  entityRef: string;
  /**
   * The person's photo (`spec.profile.picture`). `EntityRefLink` resolves a
   * display name on its own but never a picture: `DefaultEntityPresentationApi`
   * fetches a fixed field list that `spec.profile.picture` is not part of, and
   * the list is not configurable. So the caller reads it -- ideally once for a
   * whole table rather than once per row -- and passes it in here.
   */
  picture?: string;
  /**
   * The person's display name, used for the avatar's initials until the photo
   * loads, and when there is no photo. Falls back to the entity ref's name.
   */
  displayName?: string;
  /**
   * Set inside a table or list row that acts on a press anywhere within it.
   * Without it a click on this link both follows the link and triggers the row.
   */
  inRow?: boolean;
};

/**
 * A person: their photo, their display name, and a link to their catalog entity.
 *
 * The name and the link come from `EntityRefLink`, so an entity ref with no
 * catalog entity behind it -- an outside contributor, a bot -- degrades to the
 * ref's own name instead of rendering blank. The avatar replaces the generic
 * person glyph `EntityRefLink` would otherwise show, hence `hideIcon`.
 */
export function UserEntityLink({
  entityRef,
  picture,
  displayName,
  inRow,
}: UserEntityLinkProps) {
  const pressProps = inRow
    ? {
        onPointerDown: stopRowPress,
        onPointerUp: stopRowPress,
        onClick: stopRowPress,
      }
    : {};

  return (
    <Flex align="center" gap="2">
      <Avatar
        size="small"
        purpose="decoration"
        name={displayName ?? entityRef.split('/').pop() ?? entityRef}
        src={picture ?? ''}
      />
      <EntityRefLink entityRef={entityRef} hideIcon {...pressProps} />
    </Flex>
  );
}
