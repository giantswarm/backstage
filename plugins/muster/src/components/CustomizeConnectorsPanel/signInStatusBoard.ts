import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { ServerSignInStatusState } from '../shared';

/**
 * Each row's sign-in state, written by the cell that holds the row's one
 * `useServerSignInStatus` call and read by the cells beside it: a second call
 * would keep its own click answers and run its own effects.
 */
export class SignInStatusBoard {
  private readonly states = new Map<string, ServerSignInStatusState>();
  private readonly listeners = new Set<() => void>();

  get(id: string): ServerSignInStatusState | undefined {
    return this.states.get(id);
  }

  set(id: string, state: ServerSignInStatusState | undefined) {
    if (this.states.get(id) === state) {
      return;
    }
    if (state) {
      this.states.set(id, state);
    } else {
      this.states.delete(id);
    }
    this.listeners.forEach(listener => listener());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export function useSignInStatusBoard(): SignInStatusBoard {
  const [board] = useState(() => new SignInStatusBoard());
  return board;
}

/** Writes a row's sign-in state to the board, and removes it on unmount. */
export function usePublishSignInStatus(
  board: SignInStatusBoard,
  id: string,
  state: ServerSignInStatusState,
) {
  // Before paint, so the cells beside it never show a frame without it.
  useLayoutEffect(() => board.set(id, state), [board, id, state]);
  useLayoutEffect(() => () => board.set(id, undefined), [board, id]);
}

export function useBoardSignInStatus(
  board: SignInStatusBoard,
  id: string,
): ServerSignInStatusState | undefined {
  return useSyncExternalStore(board.subscribe, () => board.get(id));
}
