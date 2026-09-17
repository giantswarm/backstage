import { MODEL_MANAGER_SERVER } from '../lib/modelManagerBackends';
import {
  useMusterServerAvailability,
  type MusterServerPresence,
} from './useMusterServerAvailability';

export type ModelManagerInstallations = {
  /**
   * Installations (in input order) that are reachable and whose muster lists
   * model-manager — where its tools can be called as the signed-in person.
   */
  installations: string[];
  /** Some installation's server list has not answered yet (the set may still grow). */
  isLoading: boolean;
  /**
   * What the installation's muster said about model-manager: `available`,
   * `missing` (muster answered without it), `unknown` (not answered, failed,
   * or no muster plugin). Only `missing` is a verdict.
   */
  presenceOf: (installation: string) => MusterServerPresence;
  /** The muster plugin is not installed: model-manager is reachable nowhere. */
  isUnavailable: boolean;
};

/**
 * Narrows installations to those that have a model-manager: the ones whose
 * muster registers it as an MCPServer (`core_mcpserver_list`, read through the
 * person's own muster session — the hop every model-manager call takes). The
 * gate for the model-manager serving source and the backend controls, so an
 * installation without one shows what it shows without model-manager and is
 * never asked, and no portal configuration says where model-manager is.
 */
export function useModelManagerInstallations(
  reachableInstallations: string[],
): ModelManagerInstallations {
  const availability = useMusterServerAvailability(
    MODEL_MANAGER_SERVER,
    reachableInstallations,
  );
  return {
    installations: availability.available,
    isLoading: availability.isLoading,
    presenceOf: availability.presenceOf,
    isUnavailable: availability.isUnavailable,
  };
}
