import semver from 'semver';
import { Box, Tooltip, styled } from '@material-ui/core';
import ReportProblemOutlined from '@material-ui/icons/ReportProblemOutlined';
import { getCommitURL, getReleaseNotesURL } from '../../utils/helpers';
import { ColorWrapper } from '../ColorWrapper';
import { ExternalLink } from '../ExternalLink';

const StyledReportProblemOutlined = styled(ReportProblemOutlined)(
  ({ theme }) => ({
    marginLeft: theme.spacing(1),
    fontSize: '1.25rem',
    color: theme.palette.status.warning,
  }),
);

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
  /**
   * The version string to display
   */
  version: string;

  /**
   * Optional source location. If given, a link icon will be shown with a URL generated from the sourceLocation plus the version string.
   */
  sourceLocation?: string;

  /**
   * If set, a warning is displayed to indicate that the current version is not equal to the last attempted version (specified by `warningMessageVersion`).
   */
  displayWarning?: boolean;

  /**
   * The last version attempted (e. g. for a deployment). Must be different from version.
   */
  warningMessageVersion?: string;

  /**
   * If true, the version will be displayed in a colored box, where the color is unique for the version.
   */
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
        <ExternalLink
          href={
            commitHash
              ? getCommitURL(sourceLocation, commitHash)
              : getReleaseNotesURL(sourceLocation, versionLabel)
          }
        >
          {versionComponent}
        </ExternalLink>
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
