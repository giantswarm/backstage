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
});
