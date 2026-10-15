import {
  ClipboardEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MESSAGE_IMAGE_MAX_COUNT } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  ComposerImage,
  messageImagesProblem,
  pastedImageName,
  prepareImage,
} from '../lib/messageImages';

export type UseComposerImagesOptions = {
  /**
   * Whether the composer takes images at all. Off, paste and drop behave as
   * they would without this hook.
   */
  enabled: boolean;
  /** Why the agent cannot take images, said instead of attaching any. */
  unsupportedReason?: string;
  /** Image bytes the session's messages already carry. */
  sessionBytes?: number;
};

/** What letting go over the box does, as the drop state says it. */
export const DROP_LABEL = 'Drop images to attach them';

/** Whether a drag carries files — from the desktop, not text or a link. */
function carriesFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * The images a composer attaches to its next message: pasted, dropped on the
 * box or picked, each checked and prepared (`prepareImage`) and held until the
 * message is sent.
 *
 * **A paste attaches images only when it carries no rich text.** A spreadsheet
 * or a word processor copies a picture of the selection beside its text and
 * HTML; there the text is what was meant, and the paste goes on as usual. An
 * image copied from a browser, a screenshot tool or a file manager carries no
 * HTML and plain text together, and is attached instead of inserting anything.
 *
 * **A drop is caught only when the drag carries files**, so text dragged into
 * the box still lands in it. A file dropped anywhere else on the page would
 * make the browser leave the page to open it — the draft gone with it — so
 * while the hook is enabled, such a drop is refused page-wide.
 *
 * Whatever cannot be attached is said in `notice`, in words that say how to
 * fix it, until the next attempt or removal.
 */
export function useComposerImages({
  enabled,
  unsupportedReason,
  sessionBytes = 0,
}: UseComposerImagesOptions) {
  const [images, setImages] = useState<ComposerImage[]>([]);
  // The list as the last update left it, for the checks of a batch still being
  // read: each image of a paste counts the ones attached before it.
  const current = useRef(images);
  const [notice, setNotice] = useState<string>();
  const [preparing, setPreparing] = useState(0);
  const [isDropTarget, setDropTarget] = useState(false);
  const dragDepth = useRef(0);

  const update = useCallback((next: ComposerImage[]) => {
    current.current = next;
    setImages(next);
  }, []);

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      if (!enabled || files.length === 0) {
        return;
      }
      if (unsupportedReason) {
        setNotice(unsupportedReason);
        return;
      }
      setNotice(undefined);
      setPreparing(count => count + 1);
      const problems: string[] = [];
      try {
        for (const [index, file] of files.entries()) {
          const prepared = await prepareImage(
            file,
            pastedImageName(file.type, index),
          );
          if (prepared.kind === 'refused') {
            problems.push(prepared.problem);
            continue;
          }
          const problem = messageImagesProblem(
            current.current,
            prepared.image,
            sessionBytes,
          );
          if (problem) {
            problems.push(problem);
            continue;
          }
          update([...current.current, prepared.image]);
        }
      } catch {
        problems.push('An image could not be read. Attach it again.');
      } finally {
        setPreparing(count => count - 1);
      }
      setNotice(problems.length > 0 ? problems.join(' ') : undefined);
    },
    [enabled, unsupportedReason, sessionBytes, update],
  );

  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      const data = event.clipboardData;
      const files = Array.from(data?.files ?? []);
      if (!enabled || files.length === 0) {
        return;
      }
      const types = Array.from(data.types);
      if (types.includes('text/plain') && types.includes('text/html')) {
        return;
      }
      event.preventDefault();
      addFiles(files);
    },
    [enabled, addFiles],
  );

  const dropTargetProps = useMemo(
    () =>
      enabled
        ? {
            onDragEnter: (event: DragEvent) => {
              if (!carriesFiles(event)) {
                return;
              }
              event.preventDefault();
              dragDepth.current += 1;
              setDropTarget(true);
            },
            onDragOver: (event: DragEvent) => {
              if (!carriesFiles(event)) {
                return;
              }
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            },
            // Enter and leave fire for every child the pointer crosses; the
            // depth says when it has left the box itself.
            onDragLeave: (event: DragEvent) => {
              if (!carriesFiles(event)) {
                return;
              }
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) {
                setDropTarget(false);
              }
            },
            onDrop: (event: DragEvent) => {
              if (!carriesFiles(event)) {
                return;
              }
              event.preventDefault();
              dragDepth.current = 0;
              setDropTarget(false);
              addFiles(Array.from(event.dataTransfer.files));
            },
          }
        : {},
    [enabled, addFiles],
  );

  // A file let go of anywhere but the box: refused rather than opened by the
  // browser in place of the page. The box's own handlers prevent the default
  // first, so this leaves its drops alone.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const refuse = (event: globalThis.DragEvent) => {
      if (!carriesFiles(event) || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
    };
    const reset = () => {
      dragDepth.current = 0;
      setDropTarget(false);
    };
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, [enabled]);

  const remove = useCallback(
    (id: string) => {
      update(current.current.filter(image => image.id !== id));
      setNotice(undefined);
    },
    [update],
  );

  const clear = useCallback(() => {
    update([]);
    setNotice(undefined);
  }, [update]);

  /**
   * Put a failed message's images back, ahead of any attached since. Bounded
   * by the count a message can carry; the restored ones come first, since they
   * belong with the text that comes back with them.
   */
  const restore = useCallback(
    (restored: readonly ComposerImage[]) => {
      if (restored.length === 0) {
        return;
      }
      const ids = new Set(restored.map(image => image.id));
      update(
        [
          ...restored,
          ...current.current.filter(image => !ids.has(image.id)),
        ].slice(0, MESSAGE_IMAGE_MAX_COUNT),
      );
    },
    [update],
  );

  return {
    images,
    /** Why the last attempt to attach did not (fully) succeed. */
    notice,
    /** Images are still being read; a send now would leave them out. */
    isPreparing: preparing > 0,
    isDropTarget,
    /** Spread on the element around the box. Empty while disabled. */
    dropTargetProps,
    /** Put on the text field. */
    onPaste,
    addFiles,
    /** Say something about images in `notice`, e.g. why none can be attached. */
    showNotice: setNotice,
    remove,
    clear,
    restore,
  };
}

export type UseComposerImagesResult = ReturnType<typeof useComposerImages>;
