import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToolTable, ToolTableItem, toolTableItem } from './ToolTable';

function renderTable(items: ToolTableItem[], props = {}) {
  return render(
    <MemoryRouter>
      <ToolTable items={items} ariaLabel="Tools" {...props} />
    </MemoryRouter>,
  );
}

const staticItem = (
  name: string,
  rest: Partial<ToolTableItem> = {},
): ToolTableItem => ({
  key: name,
  name,
  mode: { kind: 'static' },
  ...rest,
});

describe('ToolTable', () => {
  it('renders one row per item', () => {
    renderTable([staticItem('core_ping'), staticItem('core_service_list')]);

    expect(screen.getByText('core_ping')).toBeInTheDocument();
    expect(screen.getByText('core_service_list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the empty text instead of an empty table', () => {
    renderTable([], { emptyText: 'Nothing here.' });

    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders markers from the annotations', () => {
    renderTable([
      staticItem('read', { annotations: { readOnlyHint: true } }),
      staticItem('write', { annotations: { destructiveHint: true } }),
    ]);

    expect(screen.getByText('read-only')).toBeInTheDocument();
    expect(screen.getByText('destructive')).toBeInTheDocument();
  });

  // A server that sends both hints means read-only: the MCP spec defines
  // `destructiveHint` only for tools that are not read-only.
  it('does not call a read-only tool destructive', () => {
    renderTable([
      staticItem('both', {
        annotations: { readOnlyHint: true, destructiveHint: true },
      }),
    ]);

    expect(screen.getByText('read-only')).toBeInTheDocument();
    expect(screen.queryByText('destructive')).not.toBeInTheDocument();
  });

  // The marker column exists only when a row can fill it, so an unannotated
  // catalogue does not pay a gap down the middle of every row.
  it('drops the marker column when no row has a marker', () => {
    const { container } = renderTable([staticItem('a'), staticItem('b')]);
    const list = container.querySelector('[role="list"]') as HTMLElement;

    expect(list.style.getPropertyValue('--tool-table-columns')).toBe(
      'minmax(0, max-content) minmax(0, 1fr)',
    );
  });

  it('adds a marker column when some row has one', () => {
    const { container } = renderTable([
      staticItem('a'),
      staticItem('b', { annotations: { readOnlyHint: true } }),
    ]);
    const list = container.querySelector('[role="list"]') as HTMLElement;

    expect(list.style.getPropertyValue('--tool-table-columns')).toBe(
      'minmax(0, max-content) max-content minmax(0, 1fr)',
    );
  });

  // A row holding a button is still a row: a `role="list"` container whose
  // children are bare divs announces an empty list.
  it('keeps action rows as list items', () => {
    renderTable([
      staticItem('core_ping', {
        mode: { kind: 'action', onSelect: jest.fn() },
      }),
    ]);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'core_ping' }),
    ).toBeInTheDocument();
  });

  // Inside a group the button is the control; a `listitem` around it would be
  // an orphan role with no list to belong to.
  it('does not wrap select rows in list items', () => {
    renderTable(
      [
        staticItem('core_ping', {
          mode: {
            kind: 'select',
            role: 'checkbox',
            checked: false,
            onToggle: jest.fn(),
          },
        }),
      ],
      { role: 'group' },
    );

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('links the name in link mode', () => {
    renderTable([
      staticItem('core_ping', {
        mode: { kind: 'link', href: '/tools?tool=core_ping' },
      }),
    ]);

    expect(screen.getByRole('link', { name: 'core_ping' })).toHaveAttribute(
      'href',
      '/tools?tool=core_ping',
    );
  });

  it('selects a tool when an action row is clicked', async () => {
    const onSelect = jest.fn();
    renderTable([
      staticItem('core_ping', { mode: { kind: 'action', onSelect } }),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'core_ping' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('exposes select rows as checkboxes and toggles them', async () => {
    const onToggle = jest.fn();
    renderTable(
      [
        staticItem('core_ping', {
          mode: { kind: 'select', role: 'checkbox', checked: false, onToggle },
        }),
      ],
      { role: 'group' },
    );

    const checkbox = screen.getByRole('checkbox', { name: 'core_ping' });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // The star is a control of its own; nesting it inside the row button would
  // be invalid markup and would make one click do two things.
  it('keeps a trailing control outside the row button', async () => {
    const onSelect = jest.fn();
    const onStar = jest.fn();
    renderTable([
      staticItem('core_ping', {
        mode: { kind: 'action', onSelect },
        trailing: (
          <button type="button" onClick={onStar}>
            Favourite
          </button>
        ),
      }),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Favourite' }));

    expect(onStar).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('uses ariaLabel when the name is not a plain string', () => {
    renderTable([
      {
        key: 'decorated',
        name: <em>core_ping</em>,
        ariaLabel: 'core_ping',
        mode: { kind: 'action', onSelect: jest.fn() },
      },
    ]);

    expect(
      screen.getByRole('button', { name: 'core_ping' }),
    ).toBeInTheDocument();
  });
});

describe('toolTableItem', () => {
  it('prefers the summary over the description', () => {
    const item = toolTableItem(
      { name: 'core_ping', summary: 'Short.', description: 'Long.' },
      { mode: { kind: 'static' } },
    );

    expect(item).toMatchObject({
      key: 'core_ping',
      name: 'core_ping',
      description: 'Short.',
    });
  });

  it('falls back to the description', () => {
    const item = toolTableItem(
      { name: 'core_ping', description: 'Long.' },
      { mode: { kind: 'static' } },
    );

    expect(item.description).toBe('Long.');
  });

  it('lets a caller override the displayed name', () => {
    const item = toolTableItem(
      { name: 'workflow_cluster_upgrade' },
      { mode: { kind: 'static' }, name: 'cluster_upgrade' },
    );

    expect(item.name).toBe('cluster_upgrade');
    expect(item.key).toBe('workflow_cluster_upgrade');
  });
});
