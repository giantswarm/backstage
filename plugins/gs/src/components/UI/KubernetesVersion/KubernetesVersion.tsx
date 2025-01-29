import React from 'react';
import { NotAvailable } from '../NotAvailable';
import { Box, styled, Tooltip } from '@material-ui/core';
import { useK8sVersionEOLDate } from '../../hooks';
import { getKubernetesReleaseEOLStatus } from '@giantswarm/backstage-plugin-gs-common';

const EolLabel = styled(Box)(({ theme }) => ({
  display: 'inline-block',
  background:
    theme.palette.type === 'dark'
      ? theme.palette.grey[600]
      : theme.palette.grey[300],
  color: theme.palette.text.primary,
  padding: `0 ${theme.spacing(1)}px`,
  borderRadius: '3px',
  marginLeft: '5px',
  fontWeight: 400,
  lineHeight: '24px',
}));

type KubernetesVersionProps = {
  version?: string;
  hidePatchVersion?: boolean;
  hideIcon?: boolean;
  hideLabel?: boolean;
};

export const KubernetesVersion = (
  { version, hidePatchVersion, hideIcon, hideLabel }: KubernetesVersionProps = {
    version: '',
    hidePatchVersion: true,
    hideIcon: false,
    hideLabel: true,
  },
) => {
  let versionLabel = version;
  if (version && hidePatchVersion) {
    const v = version.split('.');
    versionLabel = `${v[0]}.${v[1]}`;
  }

  const eolDate = useK8sVersionEOLDate(version);
  const eolStatus = getKubernetesReleaseEOLStatus(eolDate as string);
  const isEol = eolStatus.isEol && Boolean(version);

  return (
    <Tooltip title={eolStatus.message}>
      <Box
        display="inline-block"
        width="auto"
        aria-label={`Kubernetes version: ${
          versionLabel || 'no information available'
        }`}
      >
        {!hideIcon && (
          <>
            <i
              className="fa fa-kubernetes"
              title="Kubernetes version"
              role="presentation"
              aria-hidden
            />{' '}
          </>
        )}

        {!hideLabel && <span>Kubernetes </span>}

        {versionLabel || <NotAvailable />}

        {isEol && <EolLabel aria-label="End of life">EOL</EolLabel>}
      </Box>
    </Tooltip>
  );
};
