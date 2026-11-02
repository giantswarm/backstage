import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MAX_TAGS } from '../../lib/tags';
import { TagsField } from './TagsField';

const numbered = (count: number) =>
  Array.from({ length: count }, (_, index) => `tag-${index}`);

function Field({
  initial,
  counts,
}: {
  initial: string[];
  counts?: ReadonlyMap<string, number>;
}) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  return (
    <>
      <TagsField
        tags={tags}
        draft={draft}
        error={undefined}
        counts={counts}
        onDraftChange={setDraft}
        onAdd={added => setTags(current => [...current, ...added])}
        onRemove={tag => setTags(current => current.filter(t => t !== tag))}
      />
      <p>count:{tags.length}</p>
    </>
  );
}

describe('TagsField', () => {
  it('adds up to the cap', async () => {
    render(<Field initial={numbered(MAX_TAGS - 1)} />);

    await userEvent.type(screen.getByRole('textbox'), 'last{Enter}');

    expect(screen.getByText(`count:${MAX_TAGS}`)).toBeInTheDocument();
    expect(screen.queryByText('At most 50 tags.')).not.toBeInTheDocument();
  });

  it('refuses a tag past the cap and keeps it typed', async () => {
    render(<Field initial={numbered(MAX_TAGS)} />);
    const field = screen.getByRole('textbox');

    await userEvent.type(field, 'one-more{Enter}');

    expect(screen.getByText(`count:${MAX_TAGS}`)).toBeInTheDocument();
    expect(field).toHaveValue('one-more');
    expect(screen.getByText('At most 50 tags.')).toBeInTheDocument();
  });

  it('refuses pasted tags that would pass the cap, adding none', async () => {
    render(<Field initial={numbered(MAX_TAGS - 1)} />);
    const field = screen.getByRole('textbox');

    await userEvent.click(field);
    await userEvent.paste('a, b,');

    expect(screen.getByText(`count:${MAX_TAGS - 1}`)).toBeInTheDocument();
    expect(field).toHaveValue('a, b,');
    expect(screen.getByText('At most 50 tags.')).toBeInTheDocument();
  });

  it('offers no suggestions at the cap', async () => {
    const counts = new Map([['ops', 3]]);
    const { unmount } = render(
      <Field initial={numbered(MAX_TAGS - 1)} counts={counts} />,
    );
    await userEvent.type(screen.getByRole('textbox'), 'op');
    expect(
      screen.getByRole('grid', { name: 'Suggested tags' }),
    ).toBeInTheDocument();
    unmount();

    render(<Field initial={numbered(MAX_TAGS)} counts={counts} />);
    await userEvent.type(screen.getByRole('textbox'), 'op');
    expect(
      screen.queryByRole('grid', { name: 'Suggested tags' }),
    ).not.toBeInTheDocument();
  });
});
