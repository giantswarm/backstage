// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  MODEL_MANAGER_SERVER,
  MODEL_MANAGER_TOOLS,
} from '../../../lib/modelManagerBackends';
import type { ModelManagerPlacement } from '../../../lib/modelManager';
import {
  modelHostingFixtureState,
  type ModelHostingFixtureState,
} from '../modelHostingFixtureState';
import { asJson, text } from './jsonTools';

/** An optional string argument, left out when empty. */
function optional(args: Record<string, unknown>, key: string) {
  const value = text(args, key);
  return value ? value : undefined;
}

function serveRequest(args: Record<string, unknown>) {
  return {
    model: optional(args, 'model'),
    preset: optional(args, 'preset'),
    node: optional(args, 'node'),
    nodes: Array.isArray(args.nodes) ? (args.nodes as string[]) : undefined,
    placement: optional(args, 'placement') as ModelManagerPlacement | undefined,
    backend: optional(args, 'backend'),
  };
}

/**
 * model-manager's tools in fixture mode, on `state` (the shared one by
 * default): the backends, models, nodes, presets and pulls of the data set,
 * and what a person serves, pulls and registers, kept in memory until the
 * page reloads.
 */
export function modelManagerFixtureServer(
  state: () => ModelHostingFixtureState = modelHostingFixtureState,
): FixtureMcpServer {
  const tools: FixtureMcpServer['tools'] = {
    [MODEL_MANAGER_TOOLS.getBackend]: (args, { installation }) =>
      state().getBackend(installation, optional(args, 'backend')),
    [MODEL_MANAGER_TOOLS.listBackends]: (_, { installation }) =>
      state().listBackends(installation),
    [MODEL_MANAGER_TOOLS.listModels]: (args, { installation }) =>
      state().listModels(installation, optional(args, 'backend')),
    [MODEL_MANAGER_TOOLS.getModel]: (args, { installation }) => {
      const name = text(args, 'model');
      const { models } = state().listModels(
        installation,
        optional(args, 'backend'),
      ) as { models: { name: string }[] };
      const model = models.find(m => m.name === name);
      if (!model) {
        throw new Error(`not_found: model not found: ${name}`);
      }
      return model;
    },
    [MODEL_MANAGER_TOOLS.listLoadedModels]: (args, { installation }) =>
      state().listLoaded(installation, optional(args, 'backend')),
    [MODEL_MANAGER_TOOLS.pullModel]: (args, { installation }) =>
      state().pullModel(installation, {
        model: text(args, 'model'),
        ...(typeof args.wire === 'boolean' && { wire: args.wire }),
        preset: optional(args, 'preset'),
        node: optional(args, 'node'),
        backend: optional(args, 'backend'),
        mode: optional(args, 'mode'),
      }),
    [MODEL_MANAGER_TOOLS.loadModel]: (args, { installation }) =>
      state().loadModel(installation, {
        ...serveRequest(args),
        keepAlive: optional(args, 'keepAlive'),
        mode: optional(args, 'mode'),
      }),
    [MODEL_MANAGER_TOOLS.unloadModel]: (args, { installation }) =>
      state().unloadModel(installation, {
        model: text(args, 'model'),
        backend: optional(args, 'backend'),
      }),
    [MODEL_MANAGER_TOOLS.deleteModel]: (args, { installation }) =>
      state().deleteModel(installation, {
        model: text(args, 'model'),
        ...(args.unwire === false && { unwire: false }),
        backend: optional(args, 'backend'),
      }),
    [MODEL_MANAGER_TOOLS.wireModel]: (args, { installation }) =>
      state().wireModel(installation, {
        model: text(args, 'model'),
        backend: optional(args, 'backend'),
      }),
    [MODEL_MANAGER_TOOLS.unwireModel]: (args, { installation }) =>
      state().unwireModel(installation, {
        model: text(args, 'model'),
        backend: optional(args, 'backend'),
      }),
    [MODEL_MANAGER_TOOLS.listJobs]: (args, { installation }) =>
      state().listJobs(installation, optional(args, 'backend')),
    [MODEL_MANAGER_TOOLS.getJob]: (args, { installation }) =>
      state().getJob(installation, text(args, 'id')),
    [MODEL_MANAGER_TOOLS.cancelJob]: (args, { installation }) =>
      state().cancelJob(installation, text(args, 'id')),
    [MODEL_MANAGER_TOOLS.listPresets]: (args, { installation }) =>
      state().listPresets(installation, optional(args, 'backend')),
    [MODEL_MANAGER_TOOLS.searchModels]: (args, { installation }) =>
      state().searchModels(installation, {
        query: text(args, 'query'),
        ...(typeof args.limit === 'number' && { limit: args.limit }),
        backend: optional(args, 'backend'),
      }),
    [MODEL_MANAGER_TOOLS.checkFit]: (args, { installation }) =>
      state().checkFit(installation, serveRequest(args)),
    [MODEL_MANAGER_TOOLS.listNodes]: (args, { installation }) =>
      state().listNodes(installation, optional(args, 'backend')),
    [MODEL_MANAGER_TOOLS.addBackend]: (args, { installation }) =>
      state().addBackend(installation, args),
    [MODEL_MANAGER_TOOLS.removeBackend]: (args, { installation }) =>
      state().removeBackend(installation, args),
  };
  return { server: MODEL_MANAGER_SERVER, tools: asJson(tools) };
}

/** model-manager's tools in fixture mode. */
export const modelManager: FixtureMcpServer = modelManagerFixtureServer();
