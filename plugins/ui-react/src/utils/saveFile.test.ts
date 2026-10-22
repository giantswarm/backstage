import { saveFile } from './saveFile';

describe('saveFile', () => {
  const createObjectURL = jest.fn();
  const revokeObjectURL = jest.fn();
  let click: jest.SpyInstance;
  let attachedOnClick: boolean[];

  beforeEach(() => {
    jest.useFakeTimers();
    // jsdom has neither; the helper needs both.
    URL.createObjectURL = createObjectURL.mockReturnValue('blob:file');
    URL.revokeObjectURL = revokeObjectURL;
    attachedOnClick = [];
    click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function record(this: HTMLAnchorElement) {
        attachedOnClick.push(document.body.contains(this));
      });
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it('clicks an anchor in the document and takes it out again', () => {
    saveFile('x', 'x.txt', 'text/plain');

    expect(attachedOnClick).toEqual([true]);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('lets go of the object URL only once the browser has had time to take the file', () => {
    saveFile('x', 'x.txt', 'text/plain');

    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:file');
  });
});
