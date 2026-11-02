import { ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { useCopyWithFeedback } from '../../hooks/useCopyWithFeedback';
import { useOnDialogOpen } from '../../hooks/useOnDialogOpen';
import { YamlEditorFormField } from '../YamlEditorFormField';

export type ManifestDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: ReactNode;
  /**
   * The manifest, already serialized as YAML. Left out where there is none
   * worth showing: the dialog then offers no editor and no copy.
   */
  manifest?: string;
  /** Shown above the manifest, e.g. where it comes from. */
  description?: ReactNode;
  /** Richer content above the manifest than a description, e.g. steps. */
  children?: ReactNode;
  /** The editor's label, which is also its accessible name. */
  label?: string;
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
  children,
  label = 'Manifest',
}: ManifestDialogProps) {
  const { copied, copy, reset } = useCopyWithFeedback();

  // Reset on open, not on close: the dialog keeps rendering while it fades out.
  useOnDialogOpen(isOpen, reset);

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
          {children}
          {manifest !== undefined && (
            <YamlEditorFormField
              label={label}
              value={manifest}
              readOnly
              height={360}
              maxHeight={360}
            />
          )}
        </Flex>
      </DialogBody>
      <DialogFooter>
        {manifest !== undefined && (
          <Button variant="secondary" onPress={() => copy(manifest)}>
            {copied ? 'Copied' : 'Copy manifest'}
          </Button>
        )}
        <Button variant="primary" onPress={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
