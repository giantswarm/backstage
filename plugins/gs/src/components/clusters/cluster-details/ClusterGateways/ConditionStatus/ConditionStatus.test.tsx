import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { ConditionStatus } from './ConditionStatus';

describe('<ConditionStatus />', () => {
  it('shows the reason with an ok status for a true condition', async () => {
    await renderInTestApp(
      <ConditionStatus condition={{ status: 'true', reason: 'Accepted' }} />,
    );
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByLabelText('Status ok')).toBeInTheDocument();
  });

  it('shows the reason with an error status for a false condition', async () => {
    await renderInTestApp(
      <ConditionStatus
        condition={{ status: 'false', reason: 'RefNotPermitted' }}
      />,
    );
    expect(screen.getByText('RefNotPermitted')).toBeInTheDocument();
    expect(screen.getByLabelText('Status error')).toBeInTheDocument();
  });

  it.each(['not-reported', 'not-available'] as const)(
    'never shows an ok status for %s',
    async status => {
      await renderInTestApp(<ConditionStatus condition={{ status }} />);
      expect(screen.queryByLabelText('Status ok')).not.toBeInTheDocument();
    },
  );
});
