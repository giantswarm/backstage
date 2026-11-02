import { crds } from '@giantswarm/k8s-types';
import { FluxOperatorObject } from './FluxOperatorObject';
import { LabelSelector } from './labelSelector';

type ResourceSetInterface = crds.fluxoperator.v1.ResourceSet;

/**
 * A reference from a ResourceSet to the input providers it reads inputs from:
 * either one provider by name, or every provider whose labels match.
 */
export type InputProviderRef =
  | { name: string; namespace: string }
  | { selector: LabelSelector; namespace: string };

/**
 * A set of Kubernetes resources the Flux Operator renders from templates and
 * inputs, and reconciles as a group.
 */
export class ResourceSet extends FluxOperatorObject<ResourceSetInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'fluxcd.controlplane.io';
  static readonly kind = 'ResourceSet' as const;
  static readonly plural = 'resourcesets';

  getInputs() {
    return this.jsonData.spec?.inputs;
  }

  /**
   * How inputs from several providers are combined. Defaults to `Flatten`.
   */
  getInputStrategy() {
    return this.jsonData.spec?.inputStrategy?.name ?? 'Flatten';
  }

  /**
   * The input providers this ResourceSet reads from. Providers are always
   * looked up in the ResourceSet's own namespace.
   */
  getInputProviderRefs(): InputProviderRef[] {
    const namespace = this.getNamespace() ?? '';

    return (this.jsonData.spec?.inputsFrom ?? []).flatMap(
      (ref): InputProviderRef[] => {
        if (ref.name) {
          return [{ name: ref.name, namespace }];
        }
        if (ref.selector) {
          return [{ selector: ref.selector, namespace }];
        }
        return [];
      },
    );
  }

  getDependsOn() {
    return this.jsonData.spec?.dependsOn;
  }

  getServiceAccountName() {
    return this.jsonData.spec?.serviceAccountName;
  }

  /**
   * Whether the operator waits for the rendered resources to become ready.
   * Defaults to `true`.
   */
  getWait() {
    return this.jsonData.spec?.wait ?? true;
  }

  getInventory() {
    return this.jsonData.status?.inventory;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }
}
