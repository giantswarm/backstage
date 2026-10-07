import { dialogDismissLock } from './dialogDismissLock';

describe('dialogDismissLock', () => {
  it('passes every change through while idle', () => {
    const onOpenChange = jest.fn();
    const props = dialogDismissLock(false, onOpenChange);

    props.onOpenChange(false);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(props.isDismissable).toBe(true);
    expect(props.isKeyboardDismissDisabled).toBe(false);
  });

  it('swallows a close while busy and still lets it open', () => {
    const onOpenChange = jest.fn();
    const props = dialogDismissLock(true, onOpenChange);

    props.onOpenChange(false);
    expect(onOpenChange).not.toHaveBeenCalled();
    props.onOpenChange(true);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(props.isDismissable).toBe(false);
    expect(props.isKeyboardDismissDisabled).toBe(true);
  });
});
