import {
  ReactNode,
  RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Avatar, Tooltip, TooltipTrigger } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { TooltipTriggerStateContext } from 'react-aria-components';
import { stopRowPress } from '@giantswarm/backstage-plugin-ui-react';
import {
  type ConnectorLogoSource,
  resolveConnectorLogo,
} from '../../lib/connectorLogo';
import { BRAND_MARKS } from './brandMarks';

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
  mark: ({ size }: StyleProps) => ({
    display: 'inline-flex',
    width: Math.round(size * 0.56),
    height: Math.round(size * 0.56),
    color: 'var(--bui-fg-primary)',
  }),
  trigger: ({ round }: StyleProps) => ({
    display: 'inline-flex',
    borderRadius: round ? '50%' : 9,
    cursor: 'default',
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring, #009fff)',
      outlineOffset: 2,
    },
  }),
  tooltip: {
    maxWidth: 280,
    whiteSpace: 'pre-line',
  },
});

export type ConnectorLogoProps = ConnectorLogoSource & {
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
   * `detail` under it — for a logo that stands without its name.
   */
  tooltip?: boolean;
  detail?: string;
};

/**
 * A connector's logo at the letter tile's size: the icon muster read from
 * the MCP server, else the platform's mark for the service its URL points
 * at, else the name's first letter (`resolveConnectorLogo`). An image that
 * fails to load falls back to the letter too, as bui's `Avatar` does.
 */
export function ConnectorLogo({
  name,
  icon,
  url,
  size = 36,
  round = false,
  decorative = false,
  tooltip = false,
  detail,
}: ConnectorLogoProps) {
  const classes = useStyles({ size, round });
  const logo = resolveConnectorLogo({ icon, url });
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': name } as const);

  let tile: ReactNode;
  if (logo?.kind === 'image') {
    tile = (
      <Avatar
        src={logo.src}
        name={name}
        // One letter, as the tile has.
        size="small"
        purpose={decorative ? 'decoration' : 'informative'}
        className={classes.tile}
      />
    );
  } else {
    const Mark = logo ? BRAND_MARKS[logo.brand] : undefined;
    tile = (
      <span className={classes.tile} {...a11y}>
        {Mark ? (
          <span className={classes.mark}>
            <Mark />
          </span>
        ) : (
          name.trim().charAt(0)
        )}
      </span>
    );
  }

  if (!tooltip) {
    return tile;
  }
  return (
    <LogoTooltip
      hint={detail ? `${name}\n${detail}` : name}
      className={classes.trigger}
      tooltipClassName={classes.tooltip}
    >
      {tile}
    </LogoTooltip>
  );
}

/**
 * The logo in a focusable wrapper that opens a controlled bui tooltip, as
 * `WorkflowEffectBadge` does: bui's `TooltipTrigger` only wires up
 * react-aria's own focusable components, and a phone has no hover. Escape or
 * a press elsewhere closes it; a press on it stays off the row it sits in.
 */
export function LogoTooltip({
  hint,
  className,
  tooltipClassName,
  children,
}: {
  hint: string;
  className: string;
  tooltipClassName: string;
  children: ReactNode;
}) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  // Opened by a tap, it stays until a press elsewhere: no mouseleave or blur
  // reliably follows a tap on a touch screen.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <TooltipTrigger isOpen={open} onOpenChange={setOpen}>
      <LogoTrigger wrapper={wrapper} className={className}>
        {children}
      </LogoTrigger>
      <Tooltip triggerRef={wrapper} className={tooltipClassName}>
        {hint}
      </Tooltip>
    </TooltipTrigger>
  );
}

/**
 * Opens and closes through the trigger's react-aria state rather than the
 * `open` state directly, so opening one closes any other open tooltip — a
 * focused logo's as well as a bui button's — as every bui tooltip does.
 */
function LogoTrigger({
  wrapper,
  className,
  children,
}: {
  wrapper: RefObject<HTMLSpanElement>;
  className: string;
  children: ReactNode;
}) {
  const state = useContext(TooltipTriggerStateContext);
  const show = () => state?.open(true);
  const hide = () => state?.close(true);

  return (
    // Focusable on purpose, the keyboard's way to the name; the image
    // inside carries the role.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      ref={wrapper}
      className={className}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={stopRowPress}
      onPointerUp={stopRowPress}
      onClick={event => {
        stopRowPress(event);
        show();
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          hide();
        }
      }}
    >
      {children}
    </span>
  );
}
