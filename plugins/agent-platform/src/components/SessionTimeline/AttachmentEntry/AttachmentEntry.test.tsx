import { fireEvent, render, screen } from '@testing-library/react';

import { AttachmentEntry, AttachmentEntryProps } from './AttachmentEntry';

function imageItem(
  name: string,
  dataUrl: string,
): AttachmentEntryProps['item'] {
  return {
    kind: 'attachment',
    id: '0:0:0',
    taskIndex: 0,
    name,
    isUser: false,
    preview: { kind: 'image', type: 'image/png', dataUrl, byteSize: 3 },
  };
}

describe('AttachmentEntry', () => {
  it("does not hand one image's load failure to the image that takes its place", () => {
    // Entries are keyed on their position, so a poll can put a different image
    // into the same instance.
    const { rerender } = render(
      <AttachmentEntry
        item={imageItem('broken.png', 'data:image/png;base64,AAAA')}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'broken.png' }));
    expect(
      screen.getByText("No preview: the file's contents could not be read."),
    ).toBeInTheDocument();

    rerender(
      <AttachmentEntry
        item={imageItem('chart.png', 'data:image/png;base64,BBBB')}
      />,
    );

    expect(screen.getByRole('img', { name: 'chart.png' })).toBeInTheDocument();
  });

  it('shows what the person sent as a thumbnail that opens at full size', async () => {
    const item = {
      ...imageItem('shot.png', 'data:image/png;base64,AAAA'),
      isUser: true,
    };
    render(<AttachmentEntry item={item} />);
    const thumbnail = screen.getByRole('img', { name: 'shot.png' });
    const agentImage = render(
      <AttachmentEntry
        item={imageItem('chart.png', 'data:image/png;base64,BBBB')}
      />,
    );

    // One class more than an image the agent sent: the thumbnail's bounds.
    expect(thumbnail.classList.length).toBeGreaterThan(
      agentImage.getByRole('img', { name: 'chart.png' }).classList.length,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge shot.png' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('shot.png');
  });
});
