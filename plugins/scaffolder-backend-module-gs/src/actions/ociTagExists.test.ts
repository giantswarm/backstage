import { mockServices } from '@backstage/backend-test-utils';
import { createOciTagExistsAction } from './ociTagExists';

const INPUT = {
  registry: 'gsoci.azurecr.io',
  repository: 'charts/giantswarm/release-aws',
  tag: '35.0.1',
};

function makeContext(input: Record<string, unknown>) {
  return {
    input,
    logger: mockServices.logger.mock(),
    output: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('gs:oci:tagExists', () => {
  it.each([true, false])('outputs exists=%s', async exists => {
    const tagExists = jest.fn().mockResolvedValue(exists);
    const action = createOciTagExistsAction({ tagExists });
    const ctx = makeContext(INPUT);

    await action.handler(ctx);

    expect(tagExists).toHaveBeenCalledWith(
      'gsoci.azurecr.io',
      'charts/giantswarm/release-aws',
      '35.0.1',
    );
    expect(ctx.output).toHaveBeenCalledWith('exists', exists);
  });

  it('fails the step when the registry cannot be asked', async () => {
    const tagExists = jest
      .fn()
      .mockRejectedValue(new Error('registry unavailable'));
    const action = createOciTagExistsAction({ tagExists });
    const ctx = makeContext(INPUT);

    await expect(action.handler(ctx)).rejects.toThrow('registry unavailable');
    expect(ctx.output).not.toHaveBeenCalled();
  });
});
