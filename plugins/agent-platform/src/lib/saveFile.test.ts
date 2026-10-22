import { saveFile } from './saveFile';

describe('saveFile', () => {
  const createObjectURL = jest.fn();
  const revokeObjectURL = jest.fn();
  let click: jest.SpyInstance;

  beforeEach(() => {
    // jsdom has neither; the helper needs both.
    URL.createObjectURL = createObjectURL.mockReturnValue('blob:file');
    URL.revokeObjectURL = revokeObjectURL;
    click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    click.mockRestore();
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
  });

  it('saves the content under the name and content type given', async () => {
    saveFile('{"a":1}', 'session.json', 'application/json');

    const blob: Blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('{"a":1}');

    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('session.json');
    expect(anchor.href).toBe('blob:file');
  });

  it('lets go of the object URL once the file is handed over', () => {
    saveFile('x', 'x.txt', 'text/plain');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:file');
  });
});
