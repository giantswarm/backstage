import { formatInitialValue } from './utils';
import { generateUID } from '../../utils/generateUID';

jest.mock('../../utils/generateUID', () => {
  const originalModule = jest.requireActual('../../utils/generateUID');

  return {
    __esModule: true,
    ...originalModule,
    generateUID: jest.fn(() => {}),
  };
});

describe('formatInitialValue', () => {
  it('replaces generateUID placeholders', () => {
    jest
      .mocked(generateUID)
      .mockReturnValueOnce('ab1cd')
      .mockReturnValueOnce('efg');

    expect(
      formatInitialValue(
        'test-${{generateUID(5)}}-test-${{generateUID(3)}}-test',
      ),
    ).toEqual('test-ab1cd-test-efg-test');
  });

  it('ignores generateUID placeholders with incorrect arguments', () => {
    expect(
      formatInitialValue(
        'test-${{generateUID()}}-test-${{generateUID(1s2)}}-test',
      ),
    ).toEqual('test-${{generateUID()}}-test-${{generateUID(1s2)}}-test');
  });

  it('replaces form data values placeholders', () => {
    const formData = {
      name: 'TEST_NAME',
      description: 'TEST_DESCRIPTION',
    };

    expect(
      formatInitialValue('test-${{name}}-test-${{description}}-test', formData),
    ).toEqual('test-TEST_NAME-test-TEST_DESCRIPTION-test');
  });
});
