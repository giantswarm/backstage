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
import { notInFixtures } from './notInFixtures';

/**
 * model-manager in fixture mode (`agentPlatform.fixtures: true`): no backend
 * serves models yet, so every list is empty. A read of one item and every
 * write fail with {@link notInFixtures} until the fixtures answer them.
 */
export class ModelManagerFixtureApi implements ModelManagerApi {
  async getBackend(): Promise<ModelManagerBackend> {
    throw notInFixtures('model-manager getBackend');
  }

  async listBackends(): Promise<ModelManagerBackend[]> {
    return [];
  }

  async listModels(): Promise<ModelManagerModel[]> {
    return [];
  }

  async listLoaded(): Promise<ModelManagerLoadedModel[]> {
    return [];
  }

  async pullModel(): Promise<{ job: ModelManagerJob; created: boolean }> {
    throw notInFixtures('model-manager pullModel');
  }

  async loadModel(): Promise<ModelManagerModel> {
    throw notInFixtures('model-manager loadModel');
  }

  async fitCheck(): Promise<ModelManagerFitResult> {
    throw notInFixtures('model-manager fitCheck');
  }

  async listPresets(): Promise<ModelManagerPreset[]> {
    return [];
  }

  async searchModels(): Promise<ModelManagerSearchResult[]> {
    return [];
  }

  async listNodes(): Promise<ModelManagerNode[]> {
    return [];
  }

  async unloadModel(): Promise<void> {
    throw notInFixtures('model-manager unloadModel');
  }

  async tryModel(): Promise<TryServedModelResult> {
    throw notInFixtures('model-manager tryModel');
  }

  async deleteModel(): Promise<void> {
    throw notInFixtures('model-manager deleteModel');
  }

  async wireModel(): Promise<ModelConfigRef | undefined> {
    throw notInFixtures('model-manager wireModel');
  }

  async unwireModel(): Promise<void> {
    throw notInFixtures('model-manager unwireModel');
  }

  async listJobs(): Promise<ModelManagerJob[]> {
    return [];
  }

  async getJob(): Promise<ModelManagerJob> {
    throw notInFixtures('model-manager getJob');
  }

  async cancelJob(): Promise<ModelManagerJob> {
    throw notInFixtures('model-manager cancelJob');
  }
}
