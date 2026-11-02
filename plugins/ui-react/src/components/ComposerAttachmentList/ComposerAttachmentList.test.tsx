import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ComposerAttachment,
  ComposerAttachmentList,
} from './ComposerAttachmentList';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const ATTACHMENTS: ComposerAttachment[] = [
  { id: 'a', name: 'first.png', previewUrl: PIXEL, description: 'PNG · 1 KiB' },
  { id: 'b', name: 'second.png', previewUrl: PIXEL },
  { id: 'c', name: 'third.png', previewUrl: PIXEL },
];

function Harness({ onEmptied }: { onEmptied?: () => void }) {
  const [attachments, setAttachments] = useState(ATTACHMENTS);
  return (
    <ComposerAttachmentList
      label="Attached images"
      attachments={attachments}
      onRemove={id =>
        setAttachments(current => current.filter(item => item.id !== id))
      }
      onEmptied={onEmptied}
    />
  );
}

describe('ComposerAttachmentList', () => {
  it('lists each attachment with its name, description and a named remove control', () => {
    render(<Harness />);

    const list = screen.getByRole('list', { name: 'Attached images' });
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('first.png')).toBeInTheDocument();
    expect(screen.getByText('PNG · 1 KiB')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove second.png' }),
    ).toBeInTheDocument();
  });

  it('renders nothing without attachments', () => {
    const { container } = render(
      <ComposerAttachmentList attachments={[]} onRemove={jest.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('moves the focus to the next remove control, then to the caller once empty', async () => {
    const onEmptied = jest.fn();
    render(<Harness onEmptied={onEmptied} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove second.png' }),
    );
    expect(screen.queryByText('second.png')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove third.png' }),
    ).toHaveFocus();

    // The last one: the focus goes back to the one before it.
    await userEvent.keyboard('{Enter}');
    expect(
      screen.getByRole('button', { name: 'Remove first.png' }),
    ).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onEmptied).toHaveBeenCalledTimes(1);
  });
});
