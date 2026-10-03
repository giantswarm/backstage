import { Button, Flex } from '@backstage/ui';
import { dump } from 'js-yaml';

import { manifestFilename, type Manifest } from '../../lib/clusterManager';
import { CodeBlock } from '../CodeBlock';

/**
 * cluster-manager's rendered manifests as the review shows them: each as YAML
 * with Copy and Download, for the person who applies it another way.
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
                onPress={() => navigator.clipboard?.writeText(content)}
              >
                Copy
              </Button>
              <Button
                size="small"
                variant="tertiary"
                onPress={() => downloadText(filename, content)}
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

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
