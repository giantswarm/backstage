/**
 * Props for a controlled bui `Dialog` that must stay open while `isBusy`: a
 * stray click outside, Escape or the header's close button must not orphan a
 * request already on its way to a server.
 *
 * `onOpenChange` is gated as well as the two flags: they reach the outside
 * click and Escape, but not `DialogHeader`'s close button, which bui renders
 * unconditionally and routes through `onOpenChange`.
 *
 * ```tsx
 * <Dialog isOpen={isOpen} {...dialogDismissLock(isBusy, onOpenChange)}>
 * ```
 */
export function dialogDismissLock(
  isBusy: boolean,
  onOpenChange: (isOpen: boolean) => void,
) {
  return {
    onOpenChange: (next: boolean) => {
      if (next || !isBusy) {
        onOpenChange(next);
      }
    },
    isDismissable: !isBusy,
    isKeyboardDismissDisabled: isBusy,
  };
}
