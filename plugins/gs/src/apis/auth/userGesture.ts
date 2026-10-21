/**
 * Whether the page has a user gesture (a click, a key press) recent enough to
 * open a popup: the person started what runs now. A browser without the API
 * counts as yes, which keeps the interactive path it always had.
 */
export function hasUserGesture(): boolean {
  return navigator.userActivation?.isActive ?? true;
}
