import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Button } from '@backstage/ui';
import { renderInTestApp } from '@backstage/test-utils';
import {
  mockPhoneLayout,
  type MockedLayout,
} from '../../utils/mockPhoneLayout';
import { DisabledAction } from './DisabledAction';

const REASON = 'Applied from Git — change it there.';

async function renderAction() {
  await renderInTestApp(
    <>
      <DisabledAction reason={REASON}>
        {describedBy => (
          <Button isDisabled aria-describedby={describedBy}>
            Edit
          </Button>
        )}
      </DisabledAction>
      <p>Elsewhere on the page</p>
    </>,
  );
  return screen.getByRole('button', { name: 'Edit' }).parentElement!;
}

describe('DisabledAction on a touch phone', () => {
  let layout: MockedLayout;
  beforeEach(() => {
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('says why on a tap, and keeps saying it until a tap elsewhere', async () => {
    const wrapper = await renderAction();
    expect(screen.queryByRole('tooltip')).toBeNull();

    // A tap: no hover, and a disabled button reacts to nothing itself.
    fireEvent.click(wrapper);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(REASON);

    // Tapping it again keeps it (the emulated hover and focus opened it
    // first; a toggle would close it on the same tap).
    fireEvent.pointerDown(wrapper);
    fireEvent.click(wrapper);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('Elsewhere on the page'));
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('still names the reason as the control’s description', async () => {
    await renderAction();

    expect(
      screen.getByRole('button', { name: 'Edit' }),
    ).toHaveAccessibleDescription(REASON);
  });
});
