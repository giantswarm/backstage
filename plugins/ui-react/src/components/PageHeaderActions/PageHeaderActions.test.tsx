import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  PageHeaderActionsProvider,
  useOwnPageHeader,
  usePageHeaderOwned,
} from './PageHeaderActions';

function LayoutHeader() {
  return usePageHeaderOwned() ? null : <h1>Layout</h1>;
}

function OwnHeader() {
  useOwnPageHeader();
  return <h1>Own</h1>;
}

function Page() {
  const [own, setOwn] = useState(true);
  return (
    <PageHeaderActionsProvider>
      <LayoutHeader />
      {own && <OwnHeader />}
      <button onClick={() => setOwn(false)}>Leave</button>
    </PageHeaderActionsProvider>
  );
}

describe('useOwnPageHeader', () => {
  it('keeps the layout header away while a frame owns the page header', () => {
    render(<Page />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Own' })).toBeInTheDocument();
  });

  it('gives the header back when the frame unmounts', () => {
    render(<Page />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(screen.getByRole('heading', { name: 'Layout' })).toBeInTheDocument();
  });

  it('is unowned without a provider', () => {
    render(
      <>
        <LayoutHeader />
        <OwnHeader />
      </>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(2);
  });
});
