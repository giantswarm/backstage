import {
  ErrorInfoUnion,
  IncompatibilityErrorInfo,
  isNotFoundError,
} from './queries';

function errorInfo(name: string): ErrorInfoUnion {
  const error = new Error('boom');
  error.name = name;
  return { type: 'error', cluster: 'c', error, retry: () => {} };
}

describe('isNotFoundError', () => {
  it('is true for a NotFoundError (404)', () => {
    expect(isNotFoundError(errorInfo('NotFoundError'))).toBe(true);
  });

  it('is false for a ForbiddenError (403) and generic errors', () => {
    expect(isNotFoundError(errorInfo('ForbiddenError'))).toBe(false);
    expect(isNotFoundError(errorInfo('Error'))).toBe(false);
  });

  it('is false for an incompatibility error (no HTTP status)', () => {
    const incompatibility: IncompatibilityErrorInfo = {
      type: 'incompatibility',
      cluster: 'c',
      incompatibility: {} as IncompatibilityErrorInfo['incompatibility'],
    };
    expect(isNotFoundError(incompatibility)).toBe(false);
  });
});
