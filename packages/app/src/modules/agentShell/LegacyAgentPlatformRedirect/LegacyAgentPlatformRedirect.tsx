import { Navigate, useLocation } from 'react-router-dom';
import {
  CustomizeMusterProvider,
  useMusterInstance,
} from '@giantswarm/backstage-plugin-muster';
import {
  legacyAgentPlatformTarget,
  legacyTargetNeedsInstallation,
} from '../legacyPaths';

/** The target of the current old address, with the hash kept. */
function TargetRedirect({
  defaultInstallation,
}: {
  defaultInstallation?: string;
}) {
  const { pathname, search, hash } = useLocation();
  const target = legacyAgentPlatformTarget(pathname, search, {
    defaultInstallation,
  });
  return (
    <Navigate
      to={target ? `${target.pathname}${target.search}${hash}` : '/'}
      replace
    />
  );
}

/**
 * The installation the old connector, tool and workflow pages showed for a
 * link without `?installation=`: muster's active installation, resolved the
 * way those pages resolved it (`MusterInstanceProvider`). Waits for it; where
 * no installation runs muster, the link lands on its list.
 */
function MusterDefaultRedirect() {
  const { activeInstallation, isLoadingInstallations } = useMusterInstance();
  if (isLoadingInstallations) {
    return null;
  }
  return <TargetRedirect defaultInstallation={activeInstallation} />;
}

/**
 * An address of the Agent Platform's old URL tree (`/agent-platform/**`, and
 * the older `/agents/**`), sent in one hop to where it lives now
 * (`legacyAgentPlatformTarget`), its hash kept. Until the end of 2026
 * (giantswarm/giantswarm#38510): links, bookmarks and docs out there keep
 * landing on their page.
 *
 * Every old address redirects at once, except a connector's, tool's or
 * workflow's link without `?installation=`, which waits for the installation
 * its old page would have shown.
 */
export function LegacyAgentPlatformRedirect() {
  const { pathname, search } = useLocation();
  if (!legacyTargetNeedsInstallation(pathname, search)) {
    return <TargetRedirect />;
  }
  return (
    <CustomizeMusterProvider>
      <MusterDefaultRedirect />
    </CustomizeMusterProvider>
  );
}
