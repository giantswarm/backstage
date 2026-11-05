import { ServiceUnavailableError } from '@backstage/errors';
import { ReportedServiceUnavailableError } from '../errors';
import { MusterUnreachableError } from './musterUnreachable';

describe('MusterUnreachableError', () => {
  it('names the installation and the reason', () => {
    expect(
      new MusterUnreachableError('gazelle', 'the connection was closed')
        .message,
    ).toBe('gazelle did not answer: the connection was closed');
  });

  it('is already reported, and a ServiceUnavailableError by name, so a route without the handler still answers 503', () => {
    const error = new MusterUnreachableError(
      'gazelle',
      'the MCP request failed',
    );

    expect(error).toBeInstanceOf(ReportedServiceUnavailableError);
    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error.name).toBe('ServiceUnavailableError');
  });
});
