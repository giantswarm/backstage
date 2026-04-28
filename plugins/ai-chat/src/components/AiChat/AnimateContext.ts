import { createContext } from 'react';

/**
 * Whether messages mounting right now should play entrance animations.
 *
 * Starts `false` when Thread first renders (so pre-loaded / history messages
 * are shown instantly) and flips to `true` after the first paint, so any
 * message added later (user send, assistant stream) animates in.
 */
export const AnimateContext = createContext(false);
