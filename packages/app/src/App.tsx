import { createApp } from '@backstage/frontend-defaults';

// App-level and nav modules:
import { appOverrides } from './modules/app';
import { navModule } from './modules/nav';
import { agentShellModule } from './modules/agentShell';

// GS plugins:
import gsPlugin from '@giantswarm/backstage-plugin-gs';
import fluxPlugin from '@giantswarm/backstage-plugin-flux';
import { fluxPluginOverrides } from './modules/flux';
import aiChatPlugin from '@giantswarm/backstage-plugin-ai-chat';
import { aiChatPluginOverrides } from './modules/ai-chat';
import musterPlugin from '@giantswarm/backstage-plugin-muster';
import { musterPluginOverrides } from './modules/muster';
import { plansPluginOverrides } from './modules/plans';
import { roadmapPluginOverrides } from './modules/roadmap';
import { repositoriesPluginOverrides } from './modules/repositories';
import { platformCapabilitiesPluginOverrides } from './modules/platform-capabilities';
import agentPlatformPlugin from '@giantswarm/backstage-plugin-agent-platform';
import plansPlugin from '@giantswarm/backstage-plugin-plans';
import roadmapPlugin from '@giantswarm/backstage-plugin-roadmap';
import repositoriesPlugin from '@giantswarm/backstage-plugin-repositories';
import platformCapabilitiesPlugin from '@giantswarm/backstage-plugin-platform-capabilities';
import botPrsPlugin from '@giantswarm/backstage-plugin-bot-prs';

// Upstream NFS plugins:
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import { catalogPluginOverrides } from './modules/catalog';
import catalogGraphPlugin from '@backstage/plugin-catalog-graph/alpha';
import homePlugin from '@backstage/plugin-home/alpha';
import { homePluginOverrides } from './modules/home';
import orgPlugin from '@backstage/plugin-org/alpha';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import { scaffolderPluginOverrides } from './modules/scaffolder';
import searchPlugin from '@backstage/plugin-search/alpha';
import techdocsPlugin from '@backstage/plugin-techdocs/alpha';
import userSettingsPlugin from '@backstage/plugin-user-settings/alpha';
import { userSettingsPluginOverrides } from './modules/userSettings';
import kubernetesPlugin from '@backstage/plugin-kubernetes/alpha';
import { kubernetesPluginOverrides } from './modules/kubernetes';
import apiDocsPlugin from '@backstage/plugin-api-docs/alpha';
import { apiDocsPluginOverrides } from './modules/api-docs';
import githubActionsPlugin from '@backstage-community/plugin-github-actions/alpha';
import { githubActionsPluginOverrides } from './modules/github-actions';
import pagerDutyPlugin from '@pagerduty/backstage-plugin/alpha';
import signalsPlugin from '@backstage/plugin-signals/alpha';

// Legacy plugins (compat-converted for NFS route ref discovery):
import {
  circleCINfsPlugin,
  githubPullRequestsNfsPlugin,
} from './legacyPlugins';

const app = createApp({
  features: [
    // App-level overrides (core APIs, icons, sign-in page, feature flags):
    appOverrides,
    // Nav sidebar layout:
    navModule,
    agentShellModule,

    // GS plugins:
    gsPlugin,
    fluxPlugin,
    fluxPluginOverrides,
    aiChatPlugin,
    aiChatPluginOverrides,
    // The Agent Platform page's level-1 tabs come from both plugins: muster
    // attaches "MCP Servers" and "Workflows" (`attachTo: page:agent-platform`).
    // The page sorts them into its row itself (agent-platform's
    // `AGENT_PLATFORM_TAB_ORDER`), so the order here does not matter for them.
    agentPlatformPlugin,
    musterPlugin,
    musterPluginOverrides,
    plansPluginOverrides,
    roadmapPluginOverrides,
    repositoriesPluginOverrides,
    platformCapabilitiesPluginOverrides,
    plansPlugin,
    roadmapPlugin,
    repositoriesPlugin,
    platformCapabilitiesPlugin,
    botPrsPlugin,

    // Upstream NFS plugins:
    catalogPlugin,
    catalogPluginOverrides,
    catalogGraphPlugin,
    homePlugin,
    homePluginOverrides,
    orgPlugin,
    scaffolderPlugin,
    scaffolderPluginOverrides,
    searchPlugin,
    techdocsPlugin,
    userSettingsPlugin,
    userSettingsPluginOverrides,
    kubernetesPlugin,
    kubernetesPluginOverrides,
    apiDocsPlugin,
    apiDocsPluginOverrides,
    githubActionsPlugin,
    githubActionsPluginOverrides,
    pagerDutyPlugin,
    signalsPlugin,

    // Legacy plugins (compat-converted for NFS route ref discovery):
    circleCINfsPlugin,
    githubPullRequestsNfsPlugin,
  ],
});

export default app.createRoot();
