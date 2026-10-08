import { render, screen } from '@testing-library/react';
import { ShellMain } from './ShellMain';

describe('ShellMain', () => {
  it('is the main landmark of a page without one', () => {
    render(
      <ShellMain>
        <h1>Customize</h1>
      </ShellMain>,
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
  });

  it('leaves the landmark to a page that brings its own main', () => {
    render(
      <ShellMain>
        <main>
          <h1>Catalog</h1>
        </main>
      </ShellMain>,
    );

    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0].tagName).toBe('MAIN');
    expect(document.getElementById('content')).not.toHaveAttribute('role');
  });
});
