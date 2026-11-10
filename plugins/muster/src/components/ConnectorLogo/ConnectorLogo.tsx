import { Avatar } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { HintTooltip } from '@giantswarm/backstage-plugin-ui-react';
import { connectorIconOf } from '@giantswarm/backstage-plugin-gs-common';

type StyleProps = { size: number; round: boolean };

const useStyles = makeStyles({
  // The letter tile's frame, which every logo keeps.
  tile: ({ size, round }: StyleProps) => ({
    flex: 'none',
    boxSizing: 'border-box',
    width: size,
    height: size,
    borderRadius: round ? '50%' : size / 4,
    border: '1px solid var(--bui-border-1)',
    backgroundColor: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontSize: size >= 48 ? 20 : 'inherit',
    fontWeight: 700,
    color: 'var(--bui-fg-secondary)',
    textTransform: 'uppercase',
    '& .bui-AvatarImage': {
      objectFit: 'contain',
      padding: Math.round(size * 0.16),
      boxSizing: 'border-box',
    },
    '& .bui-AvatarFallback': {
      fontSize: 'inherit',
      fontWeight: 'inherit',
      boxShadow: 'none',
      borderRadius: 0,
    },
  }),
  // The focus ring follows the tile's corners.
  trigger: ({ size, round }: StyleProps) => ({
    borderRadius: round ? '50%' : size / 4,
  }),
});

export type ConnectorLogoProps = {
  /**
   * The connector's icon, from `useConnectorIcon`: its MCPServer's
   * `.status.icon`, or the one muster announces for muster's own row.
   * Checked by `connectorIconOf`.
   */
  icon?: string;
  /** The connector's display name: its label, tooltip and fallback letter. */
  name: string;
  /** Width and height in px; the list's tile is 36, a page header's 56. */
  size?: number;
  /** A circle rather than the letter tile's rounded square, as in a stack. */
  round?: boolean;
  /** Hidden from assistive technology, where the name is written beside it. */
  decorative?: boolean;
  /**
   * Shows the name in a tooltip on hover, keyboard focus or a tap, with
   * `detail` under it — for a logo that stands without its name. The logo is
   * then a focusable image named by `name` and described by `detail`.
   */
  tooltip?: boolean;
  detail?: string;
};

/**
 * A connector's logo at the letter tile's size: its icon (`useConnectorIcon`),
 * else the name's first letter. An image that
 * fails to load falls back to the letter too, as bui's `Avatar` does.
 */
export function ConnectorLogo({
  name,
  icon,
  size = 36,
  round = false,
  decorative = false,
  tooltip = false,
  detail,
}: ConnectorLogoProps) {
  const classes = useStyles({ size, round });
  const src = connectorIconOf(icon);
  // With a tooltip, its focusable trigger carries the name instead.
  const hidden = decorative || tooltip;

  // Security: the icon may be a server-provided SVG. It goes only into the
  // `<img src>` bui's Avatar renders: never into dangerouslySetInnerHTML,
  // <object>, <embed> or <iframe>, nor fetched to theme it (connectorIconOf).
  const tile = src ? (
    <Avatar
      src={src}
      name={name}
      // One letter, as the tile has.
      size="small"
      purpose={hidden ? 'decoration' : 'informative'}
      className={classes.tile}
    />
  ) : (
    <span
      className={classes.tile}
      {...(hidden
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': name })}
    >
      {/* The whole first character: an emoji is two UTF-16 units. */}
      {Array.from(name.trim())[0]}
    </span>
  );

  if (!tooltip) {
    return tile;
  }
  return (
    <HintTooltip
      hint={detail ? `${name}\n${detail}` : name}
      label={name}
      description={detail}
      className={classes.trigger}
    >
      {tile}
    </HintTooltip>
  );
}
