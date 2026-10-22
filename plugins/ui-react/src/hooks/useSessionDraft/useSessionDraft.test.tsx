import { useState, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { identityApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { sessionDraftStorageKey, useSessionDraft } from './useSessionDraft';

const NAME = 'test-form';
const ALICE = 'user:default/alice';
const BOB = 'user:default/bob';

function identityOf(userEntityRef: string | undefined) {
  return {
    getBackstageIdentity: userEntityRef
      ? async () => ({
          type: 'user' as const,
          userEntityRef,
          ownershipEntityRefs: [userEntityRef],
        })
      : async () => {
          throw new Error('not signed in');
        },
    getProfileInfo: async () => ({}),
    getCredentials: async () => ({}),
    signOut: async () => {},
  };
}

/** Whether the form ever loaded a restored draft with its empty value. */
let loadedEmpty = false;

/** A form that keeps `text` as its draft, like a provider would. */
function useForm(name: string | undefined) {
  const [text, setText] = useState('');
  const draft = useSessionDraft({
    name,
    value: { text },
    isDirty: text !== '',
    onRestore: value => setText(value.text),
  });
  if (draft.isLoaded && draft.wasRestored && text === '') {
    loadedEmpty = true;
  }
  return { text, setText, ...draft };
}

/** `null` renders the form without a draft name. */
function render(name: string | null = NAME, user: string = ALICE) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[identityApiRef, identityOf(user)]]}>
      {children}
    </TestApiProvider>
  );
  return renderHook(() => useForm(name ?? undefined), { wrapper });
}

function stored(user = ALICE) {
  const raw = window.sessionStorage.getItem(sessionDraftStorageKey(NAME, user));
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  window.sessionStorage.clear();
  loadedEmpty = false;
});

describe('useSessionDraft', () => {
  it('keeps the value while it is dirty, and removes it once it is not', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.wasRestored).toBe(false);

    act(() => result.current.setText('half a form'));
    expect(stored()).toEqual({ version: 1, value: { text: 'half a form' } });

    act(() => result.current.setText(''));
    expect(stored()).toBeNull();
  });

  it('restores the draft when the form mounts again, in the update that loads it', async () => {
    const first = render();
    await waitFor(() => expect(first.result.current.isLoaded).toBe(true));
    act(() => first.result.current.setText('half a form'));
    first.unmount();

    const { result } = render();
    expect(result.current.isLoaded).toBe(false);
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    // Never loaded with the empty value: a gated form renders the draft first.
    expect(loadedEmpty).toBe(false);
    expect(result.current.text).toBe('half a form');
    expect(result.current.wasRestored).toBe(true);
    // Restoring does not lose it: it is stored again as the form's value.
    expect(stored()).toEqual({ version: 1, value: { text: 'half a form' } });
  });

  it("keeps people apart: another person's draft is not restored", async () => {
    window.sessionStorage.setItem(
      sessionDraftStorageKey(NAME, ALICE),
      JSON.stringify({ version: 1, value: { text: "alice's" } }),
    );

    const { result } = render(NAME, BOB);
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.text).toBe('');
    expect(result.current.wasRestored).toBe(false);
    expect(stored(ALICE)).toEqual({ version: 1, value: { text: "alice's" } });
  });

  it('drops a draft of another version instead of restoring it', async () => {
    window.sessionStorage.setItem(
      sessionDraftStorageKey(NAME, ALICE),
      JSON.stringify({ version: 0, value: { other: 'shape' } }),
    );

    const { result } = render();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.wasRestored).toBe(false);
    expect(stored()).toBeNull();
  });

  it('clears the stored draft and stores the next change again', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    act(() => result.current.setText('sent'));

    act(() => result.current.clear());
    expect(stored()).toBeNull();

    act(() => result.current.setText('sent, then changed'));
    expect(stored()?.value).toEqual({ text: 'sent, then changed' });
  });

  it('keeps nothing without a name', async () => {
    const { result } = render(null);
    expect(result.current.isLoaded).toBe(true);

    act(() => result.current.setText('edit'));
    expect(window.sessionStorage.length).toBe(0);
  });
});
