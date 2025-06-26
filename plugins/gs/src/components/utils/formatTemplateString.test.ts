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
  describe('when template string contains currentUser placeholders', () => {
    it('replaces currentUser placeholders with provided currentUser value', () => {
      expect(
        formatTemplateString(
          'test-${{currentUser()}}-test-${{currentUser()}}-test',
          {
            currentUser: 'John Doe',
          },
        ),
      ).toEqual('test-John Doe-test-John Doe-test');
    });

    it('returns null if currentUser value is not provided', () => {
      expect(
        formatTemplateString(
          'test-${{currentUser()}}-test-${{currentUser()}}-test',
        ),
      ).toEqual(null);
    });
  });

  describe('when template string contains generateUID placeholders', () => {
    it('replaces generateUID placeholders with generated values', () => {
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
  });

  describe('when template string contains data placeholders', () => {
    it('replaces data placeholders with provided values', () => {
      const data = {
        name: 'TEST_NAME',
        description: 'TEST_DESCRIPTION',
        deployment: {
          clusterName: 'TEST_CLUSTER_NAME',
        },
      };

      expect(
        formatTemplateString(
          'test-${{name}}-test-${{description}}-test-${{deployment.clusterName}}',
          { data },
        ),
      ).toEqual('test-TEST_NAME-test-TEST_DESCRIPTION-test-TEST_CLUSTER_NAME');
    });

    it('returns null if required value is not provided', () => {
      const data = {
        description: 'TEST_DESCRIPTION',
        deployment: {
          clusterName: 'TEST_CLUSTER_NAME',
        },
      };

      expect(
        formatTemplateString(
          'test-${{name}}-test-${{description}}-test-${{deployment.clusterName}}',
          { data },
        ),
      ).toEqual(null);
    });
  });
});
