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
  return renderHook(
    (props: { name: string | undefined }) => useForm(props.name),
    { wrapper, initialProps: { name: name ?? undefined } },
  );
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

  it("keeps people apart: another person's draft is neither restored nor kept", async () => {
    window.sessionStorage.setItem(
      sessionDraftStorageKey(NAME, ALICE),
      JSON.stringify({ version: 1, value: { text: "alice's" } }),
    );

    const { result } = render(NAME, BOB);
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(result.current.text).toBe('');
    expect(result.current.wasRestored).toBe(false);
    // Left in the tab by whoever used it before: not Bob's to read.
    expect(stored(ALICE)).toBeNull();
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
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    act(() => result.current.setText('sent'));

    act(() => result.current.clear());
    expect(stored()).toBeNull();
    // The form still holds the sent value, as an inline object each render:
    // a render does not store it again.
    rerender({ name: NAME });
    expect(stored()).toBeNull();

    act(() => result.current.setText('sent, then changed'));
    expect(stored()?.value).toEqual({ text: 'sent, then changed' });
  });

  it('says it restored a draft until the note is closed or the draft cleared', async () => {
    window.sessionStorage.setItem(
      sessionDraftStorageKey(NAME, ALICE),
      JSON.stringify({ version: 1, value: { text: 'kept' } }),
    );
    const first = render();
    await waitFor(() => expect(first.result.current.wasRestored).toBe(true));
    act(() => first.result.current.dismissRestored());
    expect(first.result.current.wasRestored).toBe(false);
    expect(stored()?.value).toEqual({ text: 'kept' });
    first.unmount();

    const second = render();
    await waitFor(() => expect(second.result.current.wasRestored).toBe(true));
    act(() => second.result.current.clear());
    expect(second.result.current.wasRestored).toBe(false);
  });

  it('never writes one draft under the key of another', async () => {
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    rerender({ name: 'other-form' });
    // Not loaded until the other draft is looked for.
    expect(result.current.isLoaded).toBe(false);
    act(() => result.current.setText('for the other form'));
    expect(stored()).toBeNull();

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(
      JSON.parse(
        window.sessionStorage.getItem(
          sessionDraftStorageKey('other-form', ALICE),
        )!,
      ).value,
    ).toEqual({ text: 'for the other form' });
  });

  it('keeps nothing without a name', async () => {
    const { result } = render(null);
    expect(result.current.isLoaded).toBe(true);

    act(() => result.current.setText('edit'));
    expect(window.sessionStorage.length).toBe(0);
  });
});
