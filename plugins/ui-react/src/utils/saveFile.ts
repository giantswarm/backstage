/**
 * How long the saved file's object URL is kept. Safari and older Firefox
 * start the download after `click()` returns, and a URL revoked under them
 * fails it; FileSaver.js waits the same 40 s.
 */
const REVOKE_DELAY_MS = 40_000;

/**
 * Hand `content` to the browser as a file to save, under `fileName`.
 *
 * The browser saves it as a download; what the person sees calls the action by
 * its own name (a manifest's Download, a session's Export).
 */
export function saveFile(
  content: string,
  fileName: string,
  contentType: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type: contentType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  // Attached for the click: older Firefox ignores one on a detached anchor.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
