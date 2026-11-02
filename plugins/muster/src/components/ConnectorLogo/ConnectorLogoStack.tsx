import { makeStyles } from '@material-ui/core';
import { VisuallyHidden } from '@backstage/ui';
import type { ConnectorLogoSource } from '../../lib/connectorLogo';
import { ConnectorLogo, LogoTooltip } from './ConnectorLogo';

type StyleProps = { size: number };

const useStyles = makeStyles({
  list: ({ size }: StyleProps) => ({
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: Math.round(size * 0.42),
  }),
  // Each one over the last's right edge, on the surface's colour so the one
  // under it does not show through.
  item: ({ size }: StyleProps) => ({
    display: 'inline-flex',
    borderRadius: '50%',
    backgroundColor: 'var(--bui-bg-neutral-1)',
    '& + &': {
      marginLeft: -Math.round(size / 4),
    },
  }),
  more: ({ size }: StyleProps) => ({
    boxSizing: 'border-box',
    width: size,
    height: size,
    borderRadius: '50%',
    border: '1px solid var(--bui-border-1)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: 'var(--bui-fg-secondary)',
  }),
  trigger: {
    display: 'inline-flex',
    borderRadius: '50%',
    cursor: 'default',
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring, #009fff)',
      outlineOffset: 2,
    },
  },
  tooltip: {
    maxWidth: 280,
    whiteSpace: 'pre-line',
  },
});

export type ConnectorLogoStackItem = ConnectorLogoSource & {
  /** The connector's display name: its tooltip and fallback letter. */
  name: string;
  /** Unique within the stack; the name by default. */
  key?: string;
};

export type ConnectorLogoStackProps = {
  connectors: readonly ConnectorLogoStackItem[];
  /** Circles at most, "+N" included. */
  max?: number;
  /** Each circle's width and height in px. */
  size?: number;
  className?: string;
};

/**
 * Connectors as overlapping round logos, named on hover or focus, then a
 * "+N" circle naming the rest when there are more than `max`. Nothing
 * without connectors.
 */
export function ConnectorLogoStack({
  connectors,
  max = 3,
  size = 24,
  className,
}: ConnectorLogoStackProps) {
  const classes = useStyles({ size });
  if (connectors.length === 0) {
    return null;
  }
  const shown =
    connectors.length > max
      ? connectors.slice(0, Math.max(max - 1, 0))
      : connectors;
  const rest = connectors.slice(shown.length);
  return (
    <span
      role="group"
      aria-label="Connectors"
      className={[classes.list, className].filter(Boolean).join(' ')}
    >
      {shown.map(connector => (
        <span key={connector.key ?? connector.name} className={classes.item}>
          <ConnectorLogo
            name={connector.name}
            icon={connector.icon}
            url={connector.url}
            size={size}
            round
            tooltip
          />
        </span>
      ))}
      {rest.length > 0 && (
        <span className={classes.item}>
          <LogoTooltip
            hint={rest.map(connector => connector.name).join('\n')}
            className={classes.trigger}
            tooltipClassName={classes.tooltip}
          >
            <span className={classes.more}>
              <span aria-hidden>{`+${rest.length}`}</span>
              <VisuallyHidden>{`${rest.length} more connectors`}</VisuallyHidden>
            </span>
          </LogoTooltip>
        </span>
      )}
    </span>
  );
}
