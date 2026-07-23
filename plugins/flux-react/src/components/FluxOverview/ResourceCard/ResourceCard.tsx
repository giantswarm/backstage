import { ReactNode, useMemo } from 'react';
import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  DateComponent,
  NotAvailable,
  StructuredMetadataList,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
  Box,
  Flex,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import classNames from 'classnames';
import {
  AIChatButton,
  buildExplainErrorMessage,
} from '@giantswarm/backstage-plugin-ai-chat-react';
import { CopyCommandMenu } from './CopyCommandMenu';
import { ResourceMetadata } from './ResourceMetadata';
import { makeResourceCardColorVariants } from './utils/makeResourceCardColorVariants';
import { ResourceInfo } from './ResourceInfo';

const palette = makeResourceCardColorVariants();

// The resource card background colors are custom, theme-aware hex values with
// no equivalent in the bui design tokens, so we intentionally keep a colocated
// makeStyles here (the rest of the tree is migrated to @backstage/ui).
const useStyles = makeStyles(theme => {
  const colors = palette[theme.palette.type];

  return {
    root: {
      position: 'relative',
      border: '1px solid transparent',
      borderRadius: 'var(--bui-radius-3)',
      overflow: 'hidden',
      backgroundColor: colors.default.backgroundColor,

      'a:hover > &': {
        backgroundColor: colors.default.backgroundColorHover,
      },
    },
    rootError: {
      backgroundColor: colors.error.backgroundColor,

      'a:hover > &': {
        backgroundColor: colors.error.backgroundColorHover,
      },
    },
    rootInactive: {
      backgroundColor: colors.inactive.backgroundColor,

      'a:hover > &': {
        backgroundColor: colors.inactive.backgroundColorHover,
      },
    },
    rootHighlighted: {
      borderColor: theme.palette.type === 'light' ? '#000' : '#fff',
    },
    rootSearchMatch: {
      outline: `1px solid ${theme.palette.warning.light}`,
      outlineOffset: 1,
    },
    rootCurrentSearchMatch: {
      outline: '3px solid #e91e63',
      outlineOffset: 1,
    },
    // The bui Accordion paints its own opaque surface background (via its
    // `data-bg="neutral-1"` context), which would hide the wrapper's
    // status-colored background. Keep it transparent so the wrapper stays the
    // single source of truth for the card color.
    accordion: {
      backgroundColor: 'transparent',
    },
    // Top-align the expand/collapse caret with the resource heading instead of
    // vertically centering it against the taller two-line header.
    accordionTrigger: {
      '& button': {
        alignItems: 'flex-start',
      },
    },
  };
});

type ResourceWrapperProps = {
  highlighted?: boolean;
  error?: boolean;
  inactive?: boolean;
  searchMatch?: boolean;
  currentSearchMatch?: boolean;
  className?: string;
  children?: ReactNode;
};

export const ResourceWrapper = ({
  highlighted,
  error,
  inactive,
  searchMatch,
  currentSearchMatch,
  className,
  children,
}: ResourceWrapperProps) => {
  const classes = useStyles();

  return (
    <Box
      className={classNames(
        classes.root,
        {
          [classes.rootHighlighted]: highlighted,
          [classes.rootError]: error,
          [classes.rootInactive]: inactive,
          [classes.rootSearchMatch]: searchMatch && !currentSearchMatch,
          [classes.rootCurrentSearchMatch]: currentSearchMatch,
        },
        className,
      )}
    >
      {children}
    </Box>
  );
};

type ResourceCardProps = {
  name: string;
  namespace?: string;
  kind: string;
  cluster: string;
  targetCluster?: string;
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository
    | ImagePolicy
    | ImageRepository
    | ImageUpdateAutomation;
  source?: GitRepository | OCIRepository | HelmRepository;
  highlighted?: boolean;
  error?: boolean;
};

export const ResourceCard = ({
  cluster,
  name,
  namespace,
  kind,
  targetCluster,
  resource,
  source,
  highlighted,
  error,
}: ResourceCardProps) => {
  const classes = useStyles();
  const { readyStatus, isDependencyNotReady, isReconciling, isSuspended } =
    useMemo(() => {
      if (!resource) {
        return {
          readyStatus: 'Unknown' as const,
          isDependencyNotReady: false,
          isReconciling: false,
          isSuspended: false,
        };
      }

      return resource.getOrCalculateFluxStatus();
    }, [resource]);

  const inactive = isSuspended || isDependencyNotReady;

  const readyCondition =
    readyStatus === 'False' ? resource?.findReadyCondition() : undefined;
  const failureMessage = readyCondition?.message;
  const namespacePart = namespace ? ` in namespace '${namespace}'` : '';

  let aiChatMessage: string;
  if (readyStatus === 'False' && failureMessage) {
    aiChatMessage = buildExplainErrorMessage({
      kind,
      name,
      namespace,
      cluster,
      message: failureMessage,
      reason: readyCondition?.reason,
    });
  } else if (readyStatus === 'False') {
    aiChatMessage = `Please read the ${kind} resource named '${name}'${namespacePart} on management cluster '${cluster}' and help me understand why it is not in a Ready state.`;
  } else {
    aiChatMessage = `Please read the ${kind} resource named '${name}'${namespacePart} on management cluster '${cluster}', and show me basic details, so that I can ask further questions about it.`;
  }

  const resourceInfo = (
    <ResourceInfo
      cluster={cluster}
      name={name}
      kind={kind}
      namespace={namespace}
      targetCluster={targetCluster}
      readyStatus={readyStatus}
      isDependencyNotReady={isDependencyNotReady}
      isReconciling={isReconciling}
      isSuspended={isSuspended}
      resource={resource}
      emphasized
    />
  );

  // Without a resource there is no body to reveal, so render a plain card
  // instead of a (pointless) collapsible one.
  if (!resource) {
    return (
      <ResourceWrapper
        highlighted={highlighted}
        error={error}
        inactive={inactive}
      >
        <Box p="4" pt="2">
          {resourceInfo}
        </Box>
      </ResourceWrapper>
    );
  }

  return (
    <ResourceWrapper
      highlighted={highlighted}
      error={readyStatus === 'False' || error}
      inactive={inactive}
    >
      <Accordion
        id={`${kind}-${namespace ?? ''}-${name}`}
        className={classes.accordion}
        defaultExpanded
      >
        <AccordionTrigger className={classes.accordionTrigger}>
          <Box grow pr="2">
            {resourceInfo}
          </Box>
        </AccordionTrigger>
        <AccordionPanel>
          <Flex direction="column" gap="0" pt="2">
            <Box px="4">
              <StructuredMetadataList
                metadata={{
                  Created: resource.getCreatedTimestamp() ? (
                    <DateComponent
                      value={resource.getCreatedTimestamp()}
                      relative
                    />
                  ) : (
                    <NotAvailable />
                  ),
                }}
                fixedKeyColumnWidth="120px"
              />
            </Box>
            <div
              style={{
                marginTop: '16px',
                borderTop: '1px solid var(--bui-border-1)',
              }}
            />
            <ResourceMetadata resource={resource} source={source} />
            <div
              style={{
                marginTop: '8px',
                borderTop: '1px solid var(--bui-border-1)',
              }}
            />
            <Flex align="center" mt="2" gap="2">
              <CopyCommandMenu resource={resource} />
              <AIChatButton
                troubleshoot={readyStatus === 'False'}
                items={[{ message: aiChatMessage }]}
              />
            </Flex>
          </Flex>
        </AccordionPanel>
      </Accordion>
    </ResourceWrapper>
  );
};
