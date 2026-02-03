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
const INVALID_VERSION = 'n/a';

function getCommitHash(version: string): string | null {
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

function formatVersion(version: string): string {
  const semverVersion = semver.parse(version);
  if (!semverVersion) {
    return INVALID_VERSION;
  }

  return semverVersion.toString();
}

type TruncatedVersionProps = {
  label: string;
  commitHash: string | null;
};

const TruncatedVersion = ({ label, commitHash }: TruncatedVersionProps) => {
  const prefix = commitHash
    ? label.slice(0, label.length - commitHash.length)
    : null;

  if (prefix) {
    return (
      <>
        <Box component="span" flexShrink={0}>
          {prefix}
        </Box>
        <Box component="span" overflow="hidden" minWidth={0}>
          <MiddleEllipsis>
            <span>{commitHash}</span>
          </MiddleEllipsis>
        </Box>
      </>
    );
  }

  return (
    <MiddleEllipsis>
      <span>{label}</span>
    </MiddleEllipsis>
  );
};

type VersionTextProps = {
  label: string;
  commitHash: string | null;
  truncate?: boolean;
  highlight?: boolean;
};

const VersionText = ({
  label,
  commitHash,
  truncate,
  highlight,
}: VersionTextProps) => {
  if (label === INVALID_VERSION) {
    return <>{label}</>;
  }

  const content = truncate ? (
    <TruncatedVersion label={label} commitHash={commitHash} />
  ) : (
    label
  );

  if (!highlight) {
    return <>{content}</>;
  }

  return (
    <ColorWrapper str={label}>
      {truncate ? (
        <Box component="span" display="flex">
          {content}
        </Box>
      ) : (
        content
      )}
    </ColorWrapper>
  );
};

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
  const versionLabel = formatVersion(version);
  const commitHash = getCommitHash(version);
  const hasValidVersion = versionLabel !== INVALID_VERSION;
  const displayLinkToProject = sourceLocation && hasValidVersion;

  const versionText = (
    <VersionText
      label={versionLabel}
      commitHash={commitHash}
      truncate={truncate}
      highlight={highlight}
    />
  );

  const versionComponent = truncate ? (
    <Box
      component="span"
      whiteSpace="nowrap"
      overflow="hidden"
      maxWidth="100%"
      display="flex"
      title={versionLabel}
    >
      {versionText}
    </Box>
  ) : (
    versionText
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
      maxWidth={truncate ? '100%' : undefined}
    >
      {displayLinkToProject ? (
        <Box
          overflow={truncate ? 'hidden' : undefined}
          minWidth={truncate ? 0 : undefined}
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
          <StyledReportProblemOutlined />
        </Tooltip>
      )}
    </Box>
  );
};
