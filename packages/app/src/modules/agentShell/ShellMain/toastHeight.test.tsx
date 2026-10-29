import { render, waitFor } from '@testing-library/react';
import { TOAST_HEIGHT_VAR, useToastHeight } from './toastHeight';

function Harness() {
  useToastHeight();
  return null;
}

const published = () =>
  document.documentElement.style.getPropertyValue(TOAST_HEIGHT_VAR);

function toast(height: number): HTMLElement {
  const element = document.createElement('div');
  element.className = 'Toast_toast__test';
  element.dataset.height = String(height);
  return element;
}

describe('useToastHeight', () => {
  const offsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );
  let container: HTMLElement;

  beforeAll(() => {
    // jsdom lays nothing out: a toast's height is its `data-height`.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return Number(this.dataset.height ?? 0);
      },
    });
  });
  afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight!);
  });
  beforeEach(() => {
    container = document.createElement('div');
    container.className = 'Toast_container__test';
    document.body.append(container);
  });
  afterEach(() => container.remove());

  it('publishes the front toast’s height while a toast shows, and nothing once it is gone', async () => {
    const { unmount } = render(<Harness />);
    expect(published()).toBe('');

    container.append(toast(74), toast(60));
    await waitFor(() => expect(published()).toBe('74px'));

    container.replaceChildren();
    await waitFor(() => expect(published()).toBe(''));

    container.append(toast(96));
    await waitFor(() => expect(published()).toBe('96px'));
    unmount();
    expect(published()).toBe('');
  });

  it('finds a container that mounts after the shell', async () => {
    container.remove();
    render(<Harness />);

    const late = document.createElement('div');
    late.className = 'Toast_container__test';
    late.append(toast(80));
    document.body.append(late);

    await waitFor(() => expect(published()).toBe('80px'));
    late.remove();
  });
});
