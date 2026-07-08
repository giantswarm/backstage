import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type ModelConfigInterface = crds.kagent.v1alpha2.ModelConfig;

/**
 * kagent ModelConfig — an admin-provisioned reference to a model, provider, and
 * credential secret. Agents pick one by name; ModelConfig authoring is a
 * platform-admin task done outside Backstage.
 */
export class ModelConfig extends KubeObject<ModelConfigInterface> {
  static readonly supportedVersions = ['v1alpha2'] as const;
  static readonly group = 'kagent.dev';
  static readonly kind = 'ModelConfig' as const;
  static readonly plural = 'modelconfigs';

  /**
   * Friendly name for pickers. Prefers the `ui.giantswarm.io/display-name`
   * annotation when present, otherwise falls back to the resource name.
   */
  getDisplayName() {
    return (
      this.getAnnotations()?.['ui.giantswarm.io/display-name'] ?? this.getName()
    );
  }

  getModel() {
    return this.jsonData.spec?.model;
  }

  getProvider() {
    return this.jsonData.spec?.provider;
  }
}
