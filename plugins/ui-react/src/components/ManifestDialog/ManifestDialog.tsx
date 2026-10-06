import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { errorApiRef, useApi } from '@backstage/core-plugin-api';
import useCopyToClipboard from 'react-use/esm/useCopyToClipboard';
import { YamlEditorFormField } from '../YamlEditorFormField';

export type ManifestDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  /** The manifest, already serialized as YAML. */
  manifest: string;
  /** Shown above the manifest, e.g. where it comes from. */
  description?: ReactNode;
};

/**
 * A resource manifest as syntax-highlighted, read-only YAML, with a button to
 * copy it.
 *
 * Controlled rather than a `DialogTrigger` wrapper, so the trigger can be
 * anything, a `MenuItem` included.
 */
export function ManifestDialog({
  isOpen,
  onOpenChange,
  title,
  manifest,
  description,
}: ManifestDialogProps) {
  const errorApi = useApi(errorApiRef);
  const [copied, setCopied] = useState(false);
  const [{ error }, copyToClipboard] = useCopyToClipboard();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (error) {
      errorApi.post(error);
    }
  }, [error, errorApi]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = () => {
    copyToClipboard(manifest);
    setCopied(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width="min(90vw, 860px)"
    >
      <DialogHeader>{title}</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="3">
          {description && (
            <Text as="p" variant="body-small" color="secondary">
              {description}
            </Text>
          )}
          <YamlEditorFormField
            value={manifest}
            readOnly
            height={360}
            maxHeight={360}
          />
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={handleCopy}>
          {copied && !error ? 'Copied' : 'Copy manifest'}
        </Button>
        <Button variant="primary" onPress={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
