import {
  ClipboardEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  attachedImagesProblem,
  ComposerImage,
  messageImagesProblem,
  PASTED_IMAGE_NAME,
  prepareImage,
  SessionImages,
  uniqueImageName,
} from '../lib/messageImages';

export type UseComposerImagesOptions = {
  /**
   * Whether the composer takes images at all. Off, paste and drop behave as
   * they would without this hook.
   */
  enabled: boolean;
  /**
   * The box cannot take anything right now (a session being created, a
   * question open): a paste or drop does nothing, but a file let go of
   * anywhere on the page is still refused instead of opened.
   */
  paused?: boolean;
  /** Why the agent cannot take images, said instead of attaching any. */
  unsupportedReason?: string;
  /** The images the session's messages already carry. */
  session?: SessionImages;
};

/** What letting go over the box does, as the drop state says it. */
export const DROP_LABEL = 'Drop images to attach them';

/** Whether a drag carries files — from the desktop, not text or a link. */
function carriesFiles(event: { dataTransfer: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

let nextId = 0;

/**
 * The images a composer attaches to its next message: pasted or dropped on
 * the box, each checked and prepared (`prepareImage`) and held until the
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
 * while the hook is enabled, paused or not, such a drop is refused page-wide.
 *
 * Whatever cannot be attached is said in `notice`, in words that say how to
 * fix it, until the person removes an image or attaches again once every
 * image in hand has been read. What stops the images in the box from being
 * sent as they are — more than a message carries, after a failed message's
 * came back beside newer ones — is `problem`, which lasts until it is fixed.
 */
export function useComposerImages({
  enabled,
  paused = false,
  unsupportedReason,
  session,
}: UseComposerImagesOptions) {
  const [images, setImages] = useState<ComposerImage[]>([]);
  // The list as the last update left it, for the checks of a batch still being
  // read: each image of a paste counts the ones attached before it.
  const current = useRef(images);
  const [notice, setNotice] = useState<string>();
  // What the batches being read have refused so far. Collected across
  // batches that overlap, so a slow photo finishing last does not wipe a
  // refusal a quick drop made meanwhile.
  const problems = useRef<string[]>([]);
  const reading = useRef(0);
  const [preparing, setPreparing] = useState(0);
  const [isDropTarget, setDropTarget] = useState(false);
  const dragDepth = useRef(0);
  const accepting = enabled && !paused;

  const update = useCallback((next: ComposerImage[]) => {
    current.current = next;
    setImages(next);
  }, []);

  const addFiles = useCallback(
    async (files: readonly File[], { pasted = false } = {}) => {
      if (!accepting || files.length === 0) {
        return;
      }
      if (unsupportedReason) {
        setNotice(unsupportedReason);
        return;
      }
      if (reading.current === 0) {
        problems.current = [];
        setNotice(undefined);
      }
      reading.current += 1;
      setPreparing(count => count + 1);
      try {
        for (const file of files) {
          const name =
            pasted || !file.name.trim() ? PASTED_IMAGE_NAME : file.name.trim();
          const prepared = await prepareImage(file, name);
          if (prepared.kind === 'refused') {
            problems.current.push(prepared.problem);
            continue;
          }
          const problem = messageImagesProblem(
            current.current,
            prepared.image,
            session,
          );
          if (problem) {
            problems.current.push(problem);
            continue;
          }
          nextId += 1;
          update([
            ...current.current,
            {
              ...prepared.image,
              id: `image-${nextId}`,
              name: uniqueImageName(prepared.image.name, current.current),
            },
          ]);
        }
      } catch {
        problems.current.push('An image could not be read. Attach it again.');
      } finally {
        reading.current -= 1;
        setPreparing(count => count - 1);
        setNotice(
          problems.current.length > 0 ? problems.current.join(' ') : undefined,
        );
      }
    },
    [accepting, unsupportedReason, session, update],
  );

  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      const data = event.clipboardData;
      const files = Array.from(data?.files ?? []);
      if (!accepting || files.length === 0) {
        return;
      }
      const types = Array.from(data.types);
      if (types.includes('text/plain') && types.includes('text/html')) {
        return;
      }
      event.preventDefault();
      addFiles(files, { pasted: true });
    },
    [accepting, addFiles],
  );

  const dropTargetProps = useMemo(() => {
    if (!enabled) {
      return {};
    }
    if (paused) {
      // Nothing is taken while paused, but the drop is still the box's to
      // refuse, not the browser's to open.
      return {
        onDragOver: (event: DragEvent) => {
          if (carriesFiles(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'none';
          }
        },
        onDrop: (event: DragEvent) => {
          if (carriesFiles(event)) {
            event.preventDefault();
          }
        },
      };
    }
    return {
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
      // Enter and leave fire for every child the pointer crosses; the depth
      // says when it has left the box itself.
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
    };
  }, [enabled, paused, addFiles]);

  // A drop state left over from a drag that was paused midway.
  if (paused && isDropTarget) {
    dragDepth.current = 0;
    setDropTarget(false);
  }

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
   * Put a failed message's images back, ahead of any attached since. None is
   * dropped to make them fit: if together they are more than a message
   * carries, `problem` says so and the person chooses which to remove.
   */
  const restore = useCallback(
    (restored: readonly ComposerImage[]) => {
      if (restored.length === 0) {
        return;
      }
      const ids = new Set(restored.map(image => image.id));
      const kept = current.current.filter(image => !ids.has(image.id));
      const named: ComposerImage[] = [];
      for (const image of restored) {
        named.push({
          ...image,
          name: uniqueImageName(image.name, [...named, ...kept]),
        });
      }
      update([...named, ...kept]);
    },
    [update],
  );

  const problem = useMemo(
    () => attachedImagesProblem(images, session),
    [images, session],
  );

  return {
    images,
    /** Why the last attempt to attach did not (fully) succeed. */
    notice,
    /** Why the images attached cannot be sent as they are. Blocks sending. */
    problem,
    /** Images are still being read; a send now would leave them out. */
    isPreparing: preparing > 0,
    isDropTarget,
    /** Spread on the element around the box. Empty while disabled. */
    dropTargetProps,
    /** Put on the text field. */
    onPaste,
    remove,
    clear,
    restore,
  };
}

export type UseComposerImagesResult = ReturnType<typeof useComposerImages>;
