import { Box, makeStyles, Theme } from '@material-ui/core';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
import type { MusterInstallationInfo } from '../../apis/types';
import { useMusterInstance } from '../MusterInstanceProvider';

/**
 * The hint an option carries when the backend's unauthenticated probe says the
 * installation's muster cannot be reached from this portal. The same words the
 * session gate uses, so the picker and the page agree.
 */
export const NOT_REACHABLE_HINT = 'not reachable from this portal';

/** Whether the backend reports the installation's muster as unreachable. */
export function isNotReachable(
  info: Pick<MusterInstallationInfo, 'reachable'> | undefined,
): boolean {
  return info?.reachable === false;
}

const useStyles = makeStyles((theme: Theme) => ({
  option: {
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing(1),
    minWidth: 0,
  },
  hint: {
    color: theme.palette.text.secondary,
    fontSize: theme.typography.caption.fontSize,
    whiteSpace: 'nowrap',
  },
}));

/**
 * Single-select picker over the muster installations ONLY. The list is sourced
 * from the MusterInstanceProvider: the installations whose inventory has the
 * muster API group and whose endpoint the backend can target, home first -- so
 * an MC that runs no muster aggregator can never appear here. An installation
 * whose muster the portal cannot reach is still listed (its CRD-backed screens
 * work) but says so, and its live-MCP screens render the same note instead of
 * a connect. Switching the picker re-scopes the whole muster section to the
 * chosen instance.
 */
export type InstallationPickerProps = {
  /**
   * Stretch to the container width instead of the default 320px page-header
   * cap. Used in the Workflows facet column so it lines up with the other
   * filter widgets.
   */
  fullWidth?: boolean;
};

export const InstallationPicker = ({
  fullWidth = false,
}: InstallationPickerProps) => {
  const classes = useStyles();
  const {
    installationInfos,
    activeInstallation,
    setActiveInstallation,
    isLoadingInstallations,
  } = useMusterInstance();

  if (isLoadingInstallations || installationInfos.length === 0) {
    return null;
  }

  const notReachable = new Set(
    installationInfos.filter(isNotReachable).map(info => info.name),
  );
  const items = installationInfos.map(info => ({
    label: info.name,
    value: info.name,
  }));

  return (
    <Box py={1} maxWidth={fullWidth ? undefined : 320}>
      <Autocomplete
        label="Installation"
        items={items}
        selectedValue={activeInstallation ?? null}
        onChange={value => {
          if (value) {
            setActiveInstallation(value);
          }
        }}
        renderLabel={option =>
          notReachable.has(option.value) ? (
            <span className={classes.option}>
              <span>{option.label}</span>
              <span className={classes.hint}>{NOT_REACHABLE_HINT}</span>
            </span>
          ) : (
            option.label
          )
        }
      />
    </Box>
  );
};
