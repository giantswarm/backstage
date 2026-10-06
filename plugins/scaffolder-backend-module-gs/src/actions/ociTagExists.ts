import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import type { ContainerRegistryService } from '@giantswarm/backstage-plugin-gs-node';

/**
 * The action ID and input/output schema are a stable contract with templates
 * that live outside this repo (e.g. the test cluster template in
 * giantswarm/github, which picks between a HelmRelease and an App CR by
 * whether the release chart is published) — don't change them without
 * migrating those templates first.
 */
export const createOciTagExistsAction = (
  containerRegistry: Pick<ContainerRegistryService, 'tagExists'>,
) => {
  return createTemplateAction({
    id: 'gs:oci:tagExists',
    description:
      'Checks whether a tag exists in an OCI registry repository, e.g. whether a Helm chart version is published.',
    supportsDryRun: true,
    schema: {
      input: {
        registry: z =>
          z
            .string()
            .min(1)
            .describe('The registry host, e.g. gsoci.azurecr.io'),
        repository: z =>
          z
            .string()
            .min(1)
            .describe(
              'The repository path, e.g. charts/giantswarm/release-aws',
            ),
        tag: z =>
          z.string().min(1).describe('The tag to look for, e.g. 35.0.1'),
      },
      output: {
        exists: z =>
          z
            .boolean()
            .describe(
              'Whether the tag exists. A registry 404 (which gsoci also returns for a missing repository) means false; any other registry error fails the step.',
            ),
      },
    },
    async handler(ctx) {
      const { registry, repository, tag } = ctx.input;
      const exists = await containerRegistry.tagExists(
        registry,
        repository,
        tag,
      );

      ctx.logger.info(
        `${registry}/${repository}:${tag} ${exists ? 'exists' : 'does not exist'}`,
      );
      ctx.output('exists', exists);
    },
  });
};
