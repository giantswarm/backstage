import React, { ComponentProps, ComponentType } from "react";
import { Box, Link, Tooltip, styled } from "@material-ui/core";
import ReportProblemOutlined from '@material-ui/icons/ReportProblemOutlined';
import LaunchOutlinedIcon from '@material-ui/icons/LaunchOutlined';
import { getReleaseNotesURL, truncateVersion } from "../../helpers";
import CachingColorHash from "../../cachingColorHash";
import { VersionImpl } from "../../VersionImpl";

const colorHash = new CachingColorHash();

type ColorWrapperProps = {
  str: string;
}

const ColorWrapper = styled('div')(({ theme, str }) => {
  const backgroundColor = colorHash.calculateColor(str);
  return {
    padding: '4px 6px',
    borderRadius: theme.shape.borderRadius,
    backgroundColor,
    color: theme.palette.getContrastText(backgroundColor),
  };
}) as ComponentType<ComponentProps<'div'> & ColorWrapperProps>;

const StyledReportProblemOutlined = styled(ReportProblemOutlined)(({ theme }) => ({
  marginLeft: theme.spacing(1),
  fontSize: '1.25rem',
  color: theme.palette.status.warning,
}));

const StyledLaunchOutlinedIcon = styled(LaunchOutlinedIcon)(({ theme }) => ({
  marginLeft: theme.spacing(0.5),
  fontSize: 'inherit',
}));

type VersionProps = {
  version: string;
  projectSlug?: string;
  displayWarning?: boolean;
  warningMessageVersion?: string;
  highlight?: boolean;
}

export const Version = ({
  version,
  projectSlug,
  displayWarning,
  warningMessageVersion,
  highlight,
}: VersionProps) => {
  const semverVersion = new VersionImpl(version);
  const isPreReleaseVersion = Boolean(semverVersion.getPreRelease());
  const displayLinkToProject = projectSlug && version !== '' && !isPreReleaseVersion;

  let versionLabel = version === '' ? 'n/a' : version;
  if (isPreReleaseVersion && highlight) {
    versionLabel = truncateVersion(version);
  }

  const versionComponent = highlight && version !== '' ? (
    
      <ColorWrapper str={version}>
        {versionLabel}
      </ColorWrapper>
      
  ) : versionLabel;

  return (
    <Box display='flex' alignItems="center" color='primary'>
      {displayLinkToProject ? (
        <Link
          href={getReleaseNotesURL(projectSlug, version)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Box display="flex" alignItems="center">
            {versionComponent}
            <StyledLaunchOutlinedIcon />
          </Box>
        </Link>
      ) : versionComponent}
      
      {displayWarning && (
        <Tooltip
          title={warningMessageVersion
            ? `Last attempted version is ${warningMessageVersion}`
            : 'Last applied version is different from the attempted version.'
          }
        >
          <StyledReportProblemOutlined />
        </Tooltip>
      )}
    </Box>
  );
}
