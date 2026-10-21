import { useEffect } from 'react';

/**
 * Published on `<html>` while the app shows a toast: the front toast's
 * height. A WizardFrame leaves that much room under its step, so the toast —
 * lifted above the wizard's footer by agent-shell.css — never sits on the
 * step's last control once the page is scrolled to its end.
 */
export const TOAST_HEIGHT_VAR = '--agent-shell-toast-height';

/** The app's toasts, matched by their module classes' stable prefixes. */
const TOAST_CONTAINER = "[class*='Toast_container']";
const TOAST = "[class*='Toast_toast']";

/**
 * Publishes {@link TOAST_HEIGHT_VAR} for the upstream toast stack
 * (`@backstage/plugin-app`'s ToastContainer). Its toasts are absolutely
 * positioned in a container of no height and stack behind the front one, the
 * newest, which is the container's first toast; its layout height (not its
 * transformed box, which animates) is the room the stack takes.
 */
export function useToastHeight(): void {
  useEffect(() => {
    const root = document.documentElement;
    let container: Element | null = null;
    let front: HTMLElement | null = null;

    const publish = () => {
      const height = front?.offsetHeight ?? 0;
      if (height > 0) {
        root.style.setProperty(TOAST_HEIGHT_VAR, `${height}px`);
      } else {
        root.style.removeProperty(TOAST_HEIGHT_VAR);
      }
    };
    const sizes =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(publish);
    // Toasts come and go as the container's children.
    const toasts = new MutationObserver(() => track());
    function track() {
      if (!container?.isConnected) {
        container = document.querySelector(TOAST_CONTAINER);
        toasts.disconnect();
        if (container) {
          toasts.observe(container, { childList: true });
        }
      }
      const next = container?.querySelector<HTMLElement>(TOAST) ?? null;
      if (next !== front) {
        if (front) {
          sizes?.unobserve(front);
        }
        front = next;
        if (front) {
          sizes?.observe(front);
        }
      }
      publish();
    }
    // The container mounts with the app root; until it is found, and should it
    // ever be replaced, the document is watched for it.
    const mounts = new MutationObserver(() => {
      if (!container?.isConnected) {
        track();
      }
    });
    mounts.observe(document.body, { childList: true, subtree: true });
    track();
    return () => {
      mounts.disconnect();
      toasts.disconnect();
      sizes?.disconnect();
      root.style.removeProperty(TOAST_HEIGHT_VAR);
    };
  }, []);
}
