import {
  FluxResourceStatus,
  fluxResourceStatusManager,
} from './FluxResourceStatusManager';

/**
 * Interface for Flux resources that can have status tracking
 */
export interface FluxResource {
  cluster: string;
  getKind(): string;
  getName(): string;
  getNamespace(): string | undefined;
  findReadyCondition():
    | { status: 'True' | 'False' | 'Unknown'; reason: string }
    | undefined;
  isReconciling(): boolean;
  isSuspended(): boolean;
  getFluxStatus(): FluxResourceStatus | null;
  getOrCalculateFluxStatus(): FluxResourceStatus;
  updateFluxStatus(): FluxResourceStatus;
}

/**
 * Mixin to add status management capabilities to Flux resources
 */
export class FluxResourceStatusMixin {
  /**
   * Calculate and update status for a Flux resource
   */
  static updateResourceStatus(resource: FluxResource): FluxResourceStatus {
    const readyCondition = resource.findReadyCondition();

    const newStatus: Partial<FluxResourceStatus> = {
      readyStatus: readyCondition?.status || 'Unknown',
      isDependencyNotReady: readyCondition?.reason === 'DependencyNotReady',
      isReconciling: resource.isReconciling(),
      isSuspended: resource.isSuspended(),
    };

    return fluxResourceStatusManager.updateResourceStatus(
      resource.cluster,
      resource.getKind(),
      resource.getNamespace(),
      resource.getName(),
      newStatus,
    );
  }

  /**
   * Get current status for a Flux resource
   */
  static getResourceStatus(resource: FluxResource): FluxResourceStatus | null {
    return fluxResourceStatusManager.getResourceStatus(
      resource.cluster,
      resource.getKind(),
      resource.getNamespace(),
      resource.getName(),
    );
  }

  /**
   * Get or calculate status for a Flux resource
   * If status exists in cache, return it; otherwise calculate and cache it
   */
  static getOrCalculateStatus(resource: FluxResource): FluxResourceStatus {
    const existingStatus = this.getResourceStatus(resource);
    if (existingStatus) {
      // Update the status to ensure it's current
      return this.updateResourceStatus(resource);
    }

    // Calculate new status
    return this.updateResourceStatus(resource);
  }
}
