import type {
  ModelConfigRef,
  ModelManagerBackend,
  ModelManagerFitResult,
  ModelManagerJob,
  ModelManagerLoadedModel,
  ModelManagerModel,
  ModelManagerNode,
  ModelManagerPreset,
  ModelManagerSearchResult,
} from '../../lib/modelManager';
import type { ModelManagerApi, TryServedModelResult } from '../ModelManagerApi';
import { served } from './fixtureIdentity';
import { notInFixtures } from './notInFixtures';

/**
 * model-manager in fixture mode (`agentPlatform.fixtures: true`): no backend
 * serves models yet, so every list is empty. A read of one item and every
 * write fail with {@link notInFixtures} until the fixtures answer them.
 */
export class ModelManagerFixtureApi implements ModelManagerApi {
  async getBackend(installation: string): Promise<ModelManagerBackend> {
    served(installation);
    throw notInFixtures('model-manager getBackend');
  }

  async listBackends(installation: string): Promise<ModelManagerBackend[]> {
    served(installation);
    return [];
  }

  async listModels(installation: string): Promise<ModelManagerModel[]> {
    served(installation);
    return [];
  }

  async listLoaded(installation: string): Promise<ModelManagerLoadedModel[]> {
    served(installation);
    return [];
  }

  async pullModel(): Promise<{ job: ModelManagerJob; created: boolean }> {
    throw notInFixtures('model-manager pullModel');
  }

  async loadModel(installation: string): Promise<ModelManagerModel> {
    served(installation);
    throw notInFixtures('model-manager loadModel');
  }

  async fitCheck(installation: string): Promise<ModelManagerFitResult> {
    served(installation);
    throw notInFixtures('model-manager fitCheck');
  }

  async listPresets(installation: string): Promise<ModelManagerPreset[]> {
    served(installation);
    return [];
  }

  async searchModels(
    installation: string,
  ): Promise<ModelManagerSearchResult[]> {
    served(installation);
    return [];
  }

  async listNodes(installation: string): Promise<ModelManagerNode[]> {
    served(installation);
    return [];
  }

  async unloadModel(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('model-manager unloadModel');
  }

  async tryModel(installation: string): Promise<TryServedModelResult> {
    served(installation);
    throw notInFixtures('model-manager tryModel');
  }

  async deleteModel(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('model-manager deleteModel');
  }

  async wireModel(installation: string): Promise<ModelConfigRef | undefined> {
    served(installation);
    throw notInFixtures('model-manager wireModel');
  }

  async unwireModel(installation: string): Promise<void> {
    served(installation);
    throw notInFixtures('model-manager unwireModel');
  }

  async listJobs(installation: string): Promise<ModelManagerJob[]> {
    served(installation);
    return [];
  }

  async getJob(installation: string): Promise<ModelManagerJob> {
    served(installation);
    throw notInFixtures('model-manager getJob');
  }

  async cancelJob(installation: string): Promise<ModelManagerJob> {
    served(installation);
    throw notInFixtures('model-manager cancelJob');
  }
}
