import { Button, Flex } from '@backstage/ui';
import { saveFile } from '@giantswarm/backstage-plugin-ui-react';
import { dump } from 'js-yaml';

import { manifestFilename, type Manifest } from '../../lib/clusterManager';
import { CodeBlock } from '../CodeBlock';

/**
 * cluster-manager's rendered manifests as the review shows them: each as YAML
 * with Download beside the code block's own copy control, for the person who
 * applies it another way.
 */
export function ManifestList({ manifests }: { manifests: Manifest[] }) {
  return (
    <>
      {manifests.map(manifest => {
        const filename = manifestFilename(manifest);
        const content = dump(manifest, { noRefs: true });
        return (
          <Flex key={filename} direction="column" gap="1">
            <CodeBlock filename={filename} content={content} language="yaml" />
            <Flex gap="2">
              <Button
                size="small"
                variant="tertiary"
                onPress={() => saveFile(content, filename, 'text/yaml')}
              >
                Download
              </Button>
            </Flex>
          </Flex>
        );
      })}
    </>
  );
}
