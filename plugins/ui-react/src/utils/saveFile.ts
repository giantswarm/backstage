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
  anchor.click();
  URL.revokeObjectURL(url);
}
