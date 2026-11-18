/** The tabs of `/platform/:tab`, in strip order; the first is the default. */
export const PLATFORM_TAB_IDS = ['clusters'] as const;

export type PlatformTabId = (typeof PLATFORM_TAB_IDS)[number];
