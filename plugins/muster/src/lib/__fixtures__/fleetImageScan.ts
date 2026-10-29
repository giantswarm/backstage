// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { resolve } from 'path';
import { load } from 'js-yaml';
import { MusterWorkflow } from '../k8s';

/**
 * `agent-platform/fleet-image-scan` as applied on gazelle (giantswarm/giantswarm#38792):
 * a loop over management clusters, up to 8 at once, holding a paginated
 * tool step and a nested loop over each cluster, one at a time, of seven
 * paginated tool steps — every tool step and the outer loop reshape their
 * result with jq. For tests only: it reads the YAML from disk.
 */
export function fleetImageScanWorkflow(installation = 'gazelle') {
  const manifest = load(
    readFileSync(resolve(__dirname, 'fleet-image-scan.yaml'), 'utf8'),
  );
  return new MusterWorkflow(manifest as never, installation);
}
