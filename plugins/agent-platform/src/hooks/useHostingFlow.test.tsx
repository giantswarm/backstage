import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  HOSTING_RETURN_KEY,
  useHostingFlowOutcome,
  useHostingFlowReturn,
  useOpenHostingFlow,
} from './useHostingFlow';

const View = () => {
  const open = useOpenHostingFlow();
  return (
    <button type="button" onClick={() => open('/flow')}>
      Open the flow
    </button>
  );
};

const Flow = () => {
  const closeHref = useHostingFlowReturn('/fallback');
  return <a href={closeHref}>Cancel</a>;
};

describe('useOpenHostingFlow / useHostingFlowReturn', () => {
  it('returns Cancel to the view the flow was opened from, with its query', async () => {
    await renderInTestApp(
      <Routes>
        <Route path="/flow" element={<Flow />} />
        <Route path="*" element={<View />} />
      </Routes>,
      { initialRouteEntries: ['/customize/models/hosting?x=1'] },
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Open the flow' }),
    );

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/customize/models/hosting?x=1',
    );
  });

  it('returns a deep link to the fallback, and never to another origin', async () => {
    const Launch = () => {
      const navigate = useNavigate();
      return (
        <button
          type="button"
          onClick={() =>
            navigate('/flow', {
              state: { [HOSTING_RETURN_KEY]: '//evil.example' },
            })
          }
        >
          Launch
        </button>
      );
    };
    await renderInTestApp(
      <Routes>
        <Route path="/flow" element={<Flow />} />
        <Route path="*" element={<Launch />} />
      </Routes>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Launch' }));

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/fallback',
    );
  });
});

describe('useHostingFlowOutcome', () => {
  const parse = (value: unknown) =>
    typeof value === 'string' ? value : undefined;

  const ListView = () => {
    const outcome = useHostingFlowOutcome('opened', parse);
    const { state } = useLocation();
    return (
      <>
        <p>Opened: {outcome ?? 'nothing'}</p>
        <p>State: {JSON.stringify(state)}</p>
      </>
    );
  };

  const Deploy = () => {
    const navigate = useNavigate();
    return (
      <button
        type="button"
        onClick={() =>
          navigate('/list', { state: { opened: 'pool-1', other: 'kept' } })
        }
      >
        Deploy
      </button>
    );
  };

  it('reads the outcome once and takes only its own key out of the history entry', async () => {
    await renderInTestApp(
      <Routes>
        <Route path="/list" element={<ListView />} />
        <Route path="*" element={<Deploy />} />
      </Routes>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Deploy' }));

    expect(screen.getByText('Opened: pool-1')).toBeInTheDocument();
    expect(
      await screen.findByText('State: {"other":"kept"}'),
    ).toBeInTheDocument();
  });

  it('is nothing without one', async () => {
    await renderInTestApp(<ListView />);

    expect(screen.getByText('Opened: nothing')).toBeInTheDocument();
  });
});
