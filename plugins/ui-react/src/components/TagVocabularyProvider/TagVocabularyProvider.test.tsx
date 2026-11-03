import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TagsField } from '../TagsField';
import {
  type TagSource,
  type TagSourceItems,
  type TagSourceProps,
  TagVocabularyProvider,
  useReportTags,
  useTagVocabulary,
} from './TagVocabularyProvider';

let mounted: string[] = [];

function sourceOf(name: string, items: TagSourceItems): TagSource {
  return function MockSource({ onTags }: TagSourceProps) {
    mounted.push(name);
    useReportTags(items, onTags);
    return null;
  };
}

const SOURCES = [
  sourceOf('agents', [['util', 'ops'], ['ops']]),
  sourceOf('skills', [['ops'], ['marketing']]),
];

function Counts() {
  const counts = useTagVocabulary();
  return (
    <p>
      {counts
        ? [...counts].map(([tag, count]) => `${tag}:${count}`).join(' ')
        : 'none'}
    </p>
  );
}

function Field() {
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  return (
    <TagsField
      tags={tags}
      draft={draft}
      error={undefined}
      counts={new Map([['own', 1]])}
      onDraftChange={setDraft}
      onAdd={added => setTags(current => [...current, ...added])}
      onRemove={tag => setTags(current => current.filter(t => t !== tag))}
    />
  );
}

describe('TagVocabularyProvider', () => {
  beforeEach(() => {
    mounted = [];
  });

  it('reads nothing while no reader is on screen', () => {
    render(
      <TagVocabularyProvider sources={SOURCES}>
        <p>page</p>
      </TagVocabularyProvider>,
    );
    expect(mounted).toEqual([]);
  });

  it('counts each tag across every source once a reader asks', async () => {
    render(
      <TagVocabularyProvider sources={SOURCES}>
        <Counts />
      </TagVocabularyProvider>,
    );
    expect(
      await screen.findByText('util:1 ops:3 marketing:1'),
    ).toBeInTheDocument();
    expect(mounted).toEqual(expect.arrayContaining(['agents', 'skills']));
  });

  it('is undefined without a provider', () => {
    render(<Counts />);
    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('gives a TagsField the shared vocabulary over its own counts', async () => {
    render(
      <TagVocabularyProvider sources={SOURCES}>
        <Field />
      </TagVocabularyProvider>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: /Tags/ }), 'm');

    const suggested = within(
      await screen.findByRole('grid', { name: 'Suggested tags' }),
    );
    expect(suggested.getByText('marketing')).toBeInTheDocument();
    expect(suggested.queryByText('own')).toBeNull();
  });

  it('lets a TagsField fall back to its own counts without a provider', async () => {
    render(<Field />);
    await userEvent.type(screen.getByRole('textbox', { name: /Tags/ }), 'o');

    expect(
      within(screen.getByRole('grid', { name: 'Suggested tags' })).getByText(
        'own',
      ),
    ).toBeInTheDocument();
  });
});
