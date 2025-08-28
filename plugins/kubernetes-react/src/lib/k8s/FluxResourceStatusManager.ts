export interface FluxResourceStatus {
  readyStatus: 'True' | 'False' | 'Unknown';
  isDependencyNotReady: boolean;
  isReconciling: boolean;
  isSuspended: boolean;
}

export interface FluxResourceStatusListener {
  (resourceKey: string, status: FluxResourceStatus): void;
}

interface CachedFluxResourceStatus extends FluxResourceStatus {
  lastUpdated: number;
  resourceGeneration?: number;
}

/**
 * Global resource status manager that maintains persistent status information
 * for Flux resources, preserving previous states during reconciliation periods.
 */
export class FluxResourceStatusManager {
  private static instance: FluxResourceStatusManager | null = null;
  private statusCache = new Map<string, CachedFluxResourceStatus>();
  private listeners = new Set<FluxResourceStatusListener>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start cleanup interval to prevent memory leaks
    this.startCleanupInterval();
  }

  /**
   * Get the singleton instance of FluxResourceStatusManager
   */
  static getInstance(): FluxResourceStatusManager {
    if (!FluxResourceStatusManager.instance) {
      FluxResourceStatusManager.instance = new FluxResourceStatusManager();
    }
    return FluxResourceStatusManager.instance;
  }

  /**
   * Generate a unique key for a resource
   */
  private generateResourceKey(
    cluster: string,
    kind: string,
    namespace: string | undefined,
    name: string,
  ): string {
    return `${cluster}:${kind}:${namespace || 'default'}:${name}`;
  }

  /**
   * Update or create status for a resource
   */
  updateResourceStatus(
    cluster: string,
    kind: string,
    namespace: string | undefined,
    name: string,
    newStatus: Partial<FluxResourceStatus>,
    resourceGeneration?: number,
  ): FluxResourceStatus {
    const resourceKey = this.generateResourceKey(
      cluster,
      kind,
      namespace,
      name,
    );
    const currentTime = Date.now();
    const existingStatus = this.statusCache.get(resourceKey);

    // Determine if this is a reconciliation state
    const isCurrentlyReconciling = newStatus.isReconciling === true;

    let finalStatus: FluxResourceStatus;

    if (isCurrentlyReconciling && existingStatus) {
      // During reconciliation, preserve previous readyStatus and isDependencyNotReady
      finalStatus = {
        readyStatus: existingStatus.readyStatus,
        isDependencyNotReady: existingStatus.isDependencyNotReady,
        isReconciling: true,
        isSuspended: newStatus.isSuspended ?? existingStatus.isSuspended,
      };
    } else {
      // Not reconciling or no previous status - use new values
      finalStatus = {
        readyStatus: newStatus.readyStatus ?? 'Unknown',
        isDependencyNotReady: newStatus.isDependencyNotReady ?? false,
        isReconciling: newStatus.isReconciling ?? false,
        isSuspended: newStatus.isSuspended ?? false,
      };
    }

    // Cache the status with metadata
    const cachedStatus: CachedFluxResourceStatus = {
      ...finalStatus,
      lastUpdated: currentTime,
      resourceGeneration,
    };

    this.statusCache.set(resourceKey, cachedStatus);

    // Notify listeners of the status change
    this.notifyListeners(resourceKey, finalStatus);

    return finalStatus;
  }

  /**
   * Get current status for a resource
   */
  getResourceStatus(
    cluster: string,
    kind: string,
    namespace: string | undefined,
    name: string,
  ): FluxResourceStatus | null {
    const resourceKey = this.generateResourceKey(
      cluster,
      kind,
      namespace,
      name,
    );
    const cachedStatus = this.statusCache.get(resourceKey);

    if (!cachedStatus) {
      return null;
    }

    // Return status without metadata
    return {
      readyStatus: cachedStatus.readyStatus,
      isDependencyNotReady: cachedStatus.isDependencyNotReady,
      isReconciling: cachedStatus.isReconciling,
      isSuspended: cachedStatus.isSuspended,
    };
  }

  /**
   * Remove status for a resource (useful for cleanup)
   */
  removeResourceStatus(
    cluster: string,
    kind: string,
    namespace: string | undefined,
    name: string,
  ): boolean {
    const resourceKey = this.generateResourceKey(
      cluster,
      kind,
      namespace,
      name,
    );
    return this.statusCache.delete(resourceKey);
  }

  /**
   * Add a listener for status changes
   */
  addStatusListener(listener: FluxResourceStatusListener): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get all cached resource statuses (for debugging)
   */
  getAllStatuses(): Record<string, FluxResourceStatus> {
    const result: Record<string, FluxResourceStatus> = {};

    for (const [key, cachedStatus] of this.statusCache.entries()) {
      result[key] = {
        readyStatus: cachedStatus.readyStatus,
        isDependencyNotReady: cachedStatus.isDependencyNotReady,
        isReconciling: cachedStatus.isReconciling,
        isSuspended: cachedStatus.isSuspended,
      };
    }

    return result;
  }

  /**
   * Clear all cached statuses
   */
  clearAllStatuses(): void {
    this.statusCache.clear();
  }

  /**
   * Notify all listeners of a status change
   */
  private notifyListeners(
    resourceKey: string,
    status: FluxResourceStatus,
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(resourceKey, status);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Error in resource status listener:', error);
      }
    }
  }

  /**
   * Start cleanup interval to remove stale entries
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, status] of this.statusCache.entries()) {
        if (now - status.lastUpdated > this.CACHE_TTL) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        this.statusCache.delete(key);
      }
    }, this.CACHE_TTL);
  }

  /**
   * Stop cleanup interval and clear resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.statusCache.clear();
    this.listeners.clear();
    FluxResourceStatusManager.instance = null;
  }
}

// Export singleton instance for convenience
export const fluxResourceStatusManager =
  FluxResourceStatusManager.getInstance();
