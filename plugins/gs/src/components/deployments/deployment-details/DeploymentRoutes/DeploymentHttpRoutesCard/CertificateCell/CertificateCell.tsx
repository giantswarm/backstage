import { ButtonIcon, Cell, Tooltip, TooltipTrigger } from '@backstage/ui';
import { Typography, makeStyles } from '@material-ui/core';
import InfoOutlined from '@material-ui/icons/InfoOutlined';
import { HostnameCertInfo } from '../../../../../hooks/resolveHostnameCert';

type CertSeverity = 'success' | 'warning' | 'error' | 'unknown';

const EXPIRY_WARNING_DAYS = 14;
const MS_PER_DAY = 86_400_000;

const useStyles = makeStyles(theme => ({
  certPrimary: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  },
  dot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: theme.spacing(1),
    flexShrink: 0,
  },
  dotSuccess: { backgroundColor: theme.palette.success.main },
  dotWarning: { backgroundColor: theme.palette.warning.main },
  dotError: { backgroundColor: theme.palette.error.main },
  dotUnknown: { backgroundColor: theme.palette.text.disabled },
  infoButton: {
    marginLeft: theme.spacing(0.5),
  },
  tooltip: {
    maxWidth: 600,
  },
  tooltipContent: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: theme.spacing(1),
    rowGap: theme.spacing(0.5),
    fontSize: '0.75rem',
  },
  tooltipLabel: {
    opacity: 0.7,
  },
  tooltipValue: {
    wordBreak: 'break-word',
  },
}));

function formatExpiry(expirationSeconds?: number): string | undefined {
  if (expirationSeconds === undefined) return undefined;
  const days = Math.round((expirationSeconds * 1000 - Date.now()) / MS_PER_DAY);
  if (days < 0) {
    return `expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`;
  }
  if (days === 0) return 'expires today';
  return `expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}

function certSeverity(cert: HostnameCertInfo): CertSeverity {
  const expiresMs =
    cert.expirationSeconds !== undefined
      ? cert.expirationSeconds * 1000
      : undefined;
  const expired = expiresMs !== undefined && expiresMs <= Date.now();

  if (cert.ready === 'False' || expired) return 'error';
  if (
    expiresMs !== undefined &&
    (expiresMs - Date.now()) / MS_PER_DAY < EXPIRY_WARNING_DAYS
  ) {
    return 'warning';
  }
  if (cert.ready === 'True') return 'success';
  return 'unknown';
}

function readyLabel(ready?: string): string {
  if (ready === 'True') return 'Ready';
  if (ready === 'False') return 'Not ready';
  return 'Unknown';
}

/**
 * Renders the certificate status for a hostname row: a severity-colored dot
 * with a readiness/expiry summary, and an info tooltip carrying the issuer,
 * Certificate name/namespace and matched host pattern. Returns a bui `Cell`
 * so it can be used directly as a `ColumnConfig.cell`.
 */
export function CertificateCell({ cert }: { cert?: HostnameCertInfo }) {
  const classes = useStyles();

  if (!cert) {
    return (
      <Cell>
        <Typography variant="body2" color="textSecondary">
          —
        </Typography>
      </Cell>
    );
  }

  const dotClass = {
    success: classes.dotSuccess,
    warning: classes.dotWarning,
    error: classes.dotError,
    unknown: classes.dotUnknown,
  }[certSeverity(cert)];

  const expiry = formatExpiry(cert.expirationSeconds);
  const primary = [readyLabel(cert.ready), expiry].filter(Boolean).join(' · ');
  const issuer = cert.issuerName;

  return (
    <Cell>
      <div className={classes.certPrimary}>
        <span className={`${classes.dot} ${dotClass}`} />
        <Typography variant="body2">{primary}</Typography>
        <TooltipTrigger delay={200}>
          <ButtonIcon
            className={classes.infoButton}
            icon={<InfoOutlined fontSize="inherit" />}
            aria-label="Certificate details"
            variant="tertiary"
            size="small"
          />
          <Tooltip className={classes.tooltip}>
            <div className={classes.tooltipContent}>
              {issuer && (
                <>
                  <span className={classes.tooltipLabel}>Issuer</span>
                  <span className={classes.tooltipValue}>{issuer}</span>
                </>
              )}
              <span className={classes.tooltipLabel}>Certificate</span>
              <span className={classes.tooltipValue}>{cert.certName}</span>
              <span className={classes.tooltipLabel}>Namespace</span>
              <span className={classes.tooltipValue}>{cert.namespace}</span>
              {cert.hostnamePattern && (
                <>
                  <span className={classes.tooltipLabel}>Host pattern</span>
                  <span className={classes.tooltipValue}>
                    {cert.hostnamePattern}
                  </span>
                </>
              )}
            </div>
          </Tooltip>
        </TooltipTrigger>
      </div>
    </Cell>
  );
}
