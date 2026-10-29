import { startBackend } from './startBackend';

describe('startBackend', () => {
  it('exits with 1 when the start fails', async () => {
    const exit = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await startBackend(
      {
        start: () =>
          Promise.reject(new Error("Plugin 'catalog' startup failed")),
      },
      exit,
    );

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('keeps running when the start succeeds', async () => {
    const exit = jest.fn();

    await startBackend({ start: () => Promise.resolve() }, exit);

    expect(exit).not.toHaveBeenCalled();
  });
});
