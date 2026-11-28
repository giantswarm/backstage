import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/test-utils';
import { MoreActionsMenu } from './MoreActionsMenu';

describe('MoreActionsMenu', () => {
  it('renders nothing without items', async () => {
    await renderInTestApp(<MoreActionsMenu items={[]} />);

    expect(
      screen.queryByRole('button', { name: 'More actions' }),
    ).not.toBeInTheDocument();
  });

  it('lists presses and links behind the More actions button', async () => {
    const onEdit = jest.fn();
    await renderInTestApp(
      <MoreActionsMenu
        items={[
          { id: 'edit', label: 'Edit in Git…', onAction: onEdit },
          {
            id: 'source',
            label: 'View source',
            href: 'https://github.com/giantswarm/skills',
            newTab: true,
          },
          { id: 'remove', label: 'Remove…', danger: true, isDisabled: true },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      screen.getByRole('menuitem', { name: 'View source' }),
    ).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('menuitem', { name: 'Remove…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Edit in Git…' }),
    );
    expect(onEdit).toHaveBeenCalled();
  });

  it('says why a disabled item is unavailable, as visible text and as its one accessible description', async () => {
    await renderInTestApp(
      <MoreActionsMenu
        items={[
          {
            id: 'edit',
            label: 'Change settings',
            isDisabled: true,
            disabledReason: "You don't have rights to edit it.",
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const item = screen.getByRole('menuitem', { name: 'Change settings' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(
      "You don't have rights to edit it.",
    );
    expect(screen.getByText("You don't have rights to edit it.")).toBeVisible();
    expect(item).not.toHaveAttribute('aria-description');
  });
});
