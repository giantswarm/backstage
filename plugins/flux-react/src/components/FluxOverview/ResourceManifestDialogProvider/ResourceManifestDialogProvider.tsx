import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import {
  KubeObject,
  toKubectlYaml,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ManifestDialog } from '@giantswarm/backstage-plugin-ui-react';

type ShowResourceManifest = (resource: KubeObject) => void;

const ShowResourceManifestContext = createContext<
  ShowResourceManifest | undefined
>(undefined);

type Snapshot = {
  title: string;
  cluster: string;
  manifest: string;
};

/**
 * Owns the one manifest dialog of the details panel, so that it outlives the
 * card that opened it: a poll can remove the resource, and Cmd/Ctrl+G can
 * select another one, while the dialog is open.
 *
 * The manifest is a snapshot taken on open. Resources are polled, and replacing
 * the document on every poll would reset the reader's selection and scroll.
 */
export const ResourceManifestDialogProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isOpen, setOpen] = useState(false);
  // Kept after closing, so the dialog doesn't go blank while it fades out.
  const [snapshot, setSnapshot] = useState<Snapshot>();

  const showManifest = useCallback((resource: KubeObject) => {
    const namespace = resource.getNamespace();
    setSnapshot({
      title: `${resource.getKind()} ${namespace ? `${namespace}/` : ''}${resource.getName()}`,
      cluster: resource.cluster,
      manifest: toKubectlYaml(resource),
    });
    setOpen(true);
  }, []);

  return (
    <ShowResourceManifestContext.Provider value={showManifest}>
      {children}
      {snapshot && (
        <ManifestDialog
          isOpen={isOpen}
          onOpenChange={setOpen}
          title={snapshot.title}
          manifest={snapshot.manifest}
          description={
            <>
              The resource as stored on cluster{' '}
              <strong>{snapshot.cluster}</strong> when this dialog was opened,
              without server-side-apply bookkeeping. Read-only.
            </>
          }
        />
      )}
    </ShowResourceManifestContext.Provider>
  );
};

export function useShowResourceManifest(): ShowResourceManifest {
  const showManifest = useContext(ShowResourceManifestContext);
  if (!showManifest) {
    throw new Error(
      'useShowResourceManifest must be used within a ResourceManifestDialogProvider',
    );
  }
  return showManifest;
}
