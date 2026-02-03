import semver from 'semver';
import { Box, Tooltip, styled } from '@material-ui/core';
import ReportProblemOutlined from '@material-ui/icons/ReportProblemOutlined';
import MiddleEllipsis from 'react-middle-ellipsis';
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

  /**
   * If true, long versions will be truncated with middle ellipsis and show full version on hover.
   */
  truncate?: boolean;
};

export const Version = ({
  version,
  sourceLocation,
  displayWarning,
  warningMessageVersion,
  highlight,
  truncate,
}: VersionProps) => {
  const versionLabel = formatVersion(version, {
    truncateCommitHash: highlight,
  });
  const commitHash = getCommitHash(version);

  const displayLinkToProject =
    sourceLocation && versionLabel !== INVALID_VERSION;

  const versionContent =
    highlight && versionLabel !== INVALID_VERSION ? (
      <ColorWrapper str={versionLabel}>{versionLabel}</ColorWrapper>
    ) : (
      versionLabel
    );

  // When truncating with a commit hash, only truncate the hash part
  const versionPrefix =
    truncate && commitHash
      ? versionLabel.slice(0, versionLabel.length - commitHash.length)
      : null;

  const versionComponent = truncate ? (
    <Box
      component="span"
      whiteSpace="nowrap"
      overflow="hidden"
      maxWidth="100%"
      display="flex"
      title={versionLabel}
    >
      {versionPrefix ? (
        <>
          <Box component="span" flexShrink={0}>
            {highlight ? (
              <ColorWrapper str={versionLabel}>{versionPrefix}</ColorWrapper>
            ) : (
              versionPrefix
            )}
          </Box>
          <Box component="span" overflow="hidden" minWidth={0}>
            <MiddleEllipsis>
              <span>
                {highlight ? (
                  <ColorWrapper str={versionLabel}>{commitHash}</ColorWrapper>
                ) : (
                  commitHash
                )}
              </span>
            </MiddleEllipsis>
          </Box>
        </>
      ) : (
        <MiddleEllipsis>
          <span>{versionContent}</span>
        </MiddleEllipsis>
      )}
    </Box>
  ) : (
    versionContent
  );

  const warningMessage = warningMessageVersion
    ? `Last attempted version is ${warningMessageVersion}`
    : 'Last applied version is different from the attempted version.';

  return (
    <Box
      display="flex"
      alignItems="center"
      color="primary"
      overflow={truncate ? 'hidden' : undefined}
      minWidth={truncate ? 0 : undefined}
      width={truncate ? '100%' : undefined}
    >
      {displayLinkToProject ? (
        <Box
          overflow={truncate ? 'hidden' : undefined}
          minWidth={truncate ? 0 : undefined}
          flex={truncate ? 1 : undefined}
        >
          <ExternalLink
            href={
              commitHash
                ? getCommitURL(sourceLocation, commitHash)
                : getReleaseNotesURL(sourceLocation, versionLabel)
            }
          >
            {versionComponent}
          </ExternalLink>
        </Box>
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
