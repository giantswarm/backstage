import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  KubernetesObject,
  KubernetesObjectApi,
  PatchStrategy,
} from '@kubernetes/client-node';
import { loadAll } from 'js-yaml';
import { KubernetesClientFactory } from '../lib/KubernetesClientFactory';

const LAST_APPLIED_ANNOTATION =
  'kubectl.kubernetes.io/last-applied-configuration';

type AppliedObject = KubernetesObject & {
  metadata: NonNullable<KubernetesObject['metadata']>;
};

type ObjectHeader = Parameters<KubernetesObjectApi['read']>[0];

/**
 * The action ID and input schema are a stable contract with templates that
 * live outside this repo (e.g. the hidden `agent-deployment` template driven
 * by the Agent Platform create flow) — don't change them without migrating
 * those templates first.
 */
export const createKubeApplyAction = (
  clientFactory: KubernetesClientFactory,
) => {
  return createTemplateAction({
    id: 'kube:apply',
    description:
      'Applies a (multi-document) Kubernetes manifest to a configured cluster, creating or merge-patching each resource.',
    schema: {
      input: {
        manifest: z =>
          z.string().describe('The resource manifest to apply in the cluster'),
        namespaced: z =>
          z
            .boolean()
            .optional()
            .describe(
              'Whether the resources are namespaced (only affects logging)',
            ),
        clusterName: z =>
          z
            .string()
            .optional()
            .describe(
              'The name of the Kubernetes cluster to use (from app-config)',
            ),
        token: z =>
          z
            .string()
            .optional()
            .describe(
              'An optional OIDC token used to authenticate to the Kubernetes cluster',
            ),
      },
    },
    async handler(ctx) {
      const client = clientFactory.getObjectsClient({
        clusterName: ctx.input.clusterName,
        token: ctx.input.token,
      });

      const documents = loadAll(ctx.input.manifest) as Array<
        KubernetesObject | null | undefined
      >;
      const specs = documents.filter(
        (doc): doc is AppliedObject => !!doc?.kind && !!doc.metadata,
      );

      for (const spec of specs) {
        const annotations = { ...spec.metadata.annotations };
        delete annotations[LAST_APPLIED_ANNOTATION];
        spec.metadata.annotations = annotations;
        annotations[LAST_APPLIED_ANNOTATION] = JSON.stringify(spec);

        const name = `${spec.kind}/${
          spec.metadata.namespace ? `${spec.metadata.namespace}/` : ''
        }${spec.metadata.name}`;

        let exists = true;
        try {
          await client.read(spec as ObjectHeader);
        } catch {
          exists = false;
        }

        let applied: KubernetesObject;
        try {
          if (exists) {
            ctx.logger.info(`Resource exists, patching ${name}`);
            applied = await client.patch(
              spec,
              undefined,
              undefined,
              undefined,
              undefined,
              PatchStrategy.MergePatch,
            );
          } else {
            ctx.logger.info(`Resource not found, creating ${name}`);
            applied = await client.create(spec);
          }
        } catch (e) {
          ctx.logger.error(`Failed to apply ${name}: ${e}`);
          throw e;
        }
        ctx.logger.info(
          `Successfully created/updated ${applied.kind}/${
            applied.metadata?.namespace ? `${applied.metadata.namespace}/` : ''
          }${applied.metadata?.name}.`,
        );
      }
    },
  });
};
