/**
 * For tests only: makes every image load in jsdom, which loads none. bui's
 * `Avatar` (the logo's image) preloads its `src` with `new Image()` and shows
 * the `<img>` once that loads, so without this a test only ever sees the
 * letter. Returns the function that puts the real `Image` back.
 */
export function stubImageLoad(): () => void {
  const RealImage = window.Image;
  window.Image = class {
    onload: (() => void) | null = null;
    set src(_value: string) {
      setTimeout(() => this.onload?.());
    }
  } as unknown as typeof Image;
  return () => {
    window.Image = RealImage;
  };
}
