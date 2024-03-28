import React, { ComponentProps, ComponentType } from 'react';
import { Box, Link, Tooltip, styled } from '@material-ui/core';
import ReportProblemOutlined from '@material-ui/icons/ReportProblemOutlined';
import LaunchOutlinedIcon from '@material-ui/icons/LaunchOutlined';
import { getCommitURL, getReleaseNotesURL } from '../../utils/helpers';
import CachingColorHash from '../../utils/cachingColorHash';
import semver from 'semver';

const colorHash = new CachingColorHash();

type ColorWrapperProps = {
  str: string;
};

const ColorWrapper = styled('div')(({ theme, str }) => {
  const backgroundColor = colorHash.calculateColor(str);
  return {
    padding: '4px 6px',
    borderRadius: theme.shape.borderRadius,
    backgroundColor,
    color: theme.palette.getContrastText(backgroundColor),
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  };
}) as ComponentType<ComponentProps<'div'> & ColorWrapperProps>;

const StyledReportProblemOutlined = styled(ReportProblemOutlined)(
  ({ theme }) => ({
    marginLeft: theme.spacing(1),
    fontSize: '1.25rem',
    color: theme.palette.status.warning,
  }),
);

const StyledLaunchOutlinedIcon = styled(LaunchOutlinedIcon)(({ theme }) => ({
  marginLeft: theme.spacing(0.5),
  fontSize: 'inherit',
}));

const COMMIT_HASH_REGEXP = /\b[0-9a-f]{40}\b/;
const COMMIT_HASH_LENGTH_LIMIT = 5;
const INVALID_VERSION = 'n/a';

function getCommitHash(version: string) {
  const semverVersion = semver.parse(version);
  if (!semverVersion) {
    return null;
  }

  if (
    semverVersion.prerelease.length === 1 &&
    semverVersion.prerelease[0].toString().match(COMMIT_HASH_REGEXP)
  ) {
    return semverVersion.prerelease[0].toString();
  }

  return null;
}

type FormatVersionOptions = {
  truncateCommitHash?: boolean;
};

function formatVersion(
  version: string,
  { truncateCommitHash = false }: FormatVersionOptions = {},
) {
  const semverVersion = semver.parse(version);
  if (!semverVersion) {
    return INVALID_VERSION;
  }

  const versionStr = semverVersion.toString();

  const commitHash = getCommitHash(version);
  if (truncateCommitHash && commitHash) {
    return versionStr.slice(
      0,
      versionStr.length - commitHash.length + COMMIT_HASH_LENGTH_LIMIT,
    );
  }

  return versionStr;
}

export type VersionProps = {
  version: string;
  sourceLocation?: string;
  displayWarning?: boolean;
  warningMessageVersion?: string;
  highlight?: boolean;
};

export const Version = ({
  version,
  sourceLocation,
  displayWarning,
  warningMessageVersion,
  highlight,
}: VersionProps) => {
  const versionLabel = formatVersion(version, {
    truncateCommitHash: highlight,
  });
  const commitHash = getCommitHash(version);

  const displayLinkToProject =
    sourceLocation && versionLabel !== INVALID_VERSION;

  const versionComponent =
    highlight && versionLabel !== INVALID_VERSION ? (
      <ColorWrapper str={versionLabel}>{versionLabel}</ColorWrapper>
    ) : (
      versionLabel
    );

  const warningMessage = warningMessageVersion
    ? `Last attempted version is ${warningMessageVersion}`
    : 'Last applied version is different from the attempted version.';

  return (
    <Box display="flex" alignItems="center" color="primary">
      {displayLinkToProject ? (
        <Link
          href={
            commitHash
              ? getCommitURL(sourceLocation, commitHash)
              : getReleaseNotesURL(sourceLocation, versionLabel)
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          <Box display="flex" alignItems="center">
            {versionComponent}
            <StyledLaunchOutlinedIcon />
          </Box>
        </Link>
      ) : (
        versionComponent
      )}

      {displayWarning && (
        <Tooltip title={warningMessage}>
          <StyledReportProblemOutlined titleAccess={warningMessage} />
        </Tooltip>
      )}
    </Box>
  );
};
