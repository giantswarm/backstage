import { formatTemplateString } from './formatTemplateString';
import { generateUID } from './generateUID';

jest.mock('./generateUID', () => {
  const originalModule = jest.requireActual('./generateUID');

  return {
    __esModule: true,
    ...originalModule,
    generateUID: jest.fn(() => {}),
  };
});

describe('formatTemplateString', () => {
  it('replaces generateUID placeholders', () => {
    jest
      .mocked(generateUID)
      .mockReturnValueOnce('ab1cd')
      .mockReturnValueOnce('efg');

    expect(
      formatTemplateString(
        'test-${{generateUID(5)}}-test-${{generateUID(3)}}-test',
      ),
    ).toEqual('test-ab1cd-test-efg-test');
  });

  it('ignores generateUID placeholders with incorrect arguments', () => {
    expect(
      formatTemplateString(
        'test-${{generateUID()}}-test-${{generateUID(1s2)}}-test',
      ),
    ).toEqual('test-${{generateUID()}}-test-${{generateUID(1s2)}}-test');
  });

  it('replaces form data values placeholders', () => {
    const formData = {
      name: 'TEST_NAME',
      description: 'TEST_DESCRIPTION',
      deployment: {
        clusterName: 'TEST_CLUSTER_NAME',
      },
    };

    expect(
      formatTemplateString(
        'test-${{name}}-test-${{description}}-test-${{deployment.clusterName}}',
        formData,
      ),
    ).toEqual('test-TEST_NAME-test-TEST_DESCRIPTION-test-TEST_CLUSTER_NAME');
  });
});
