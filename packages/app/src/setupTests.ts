import '@testing-library/jest-dom';
// eslint-disable-next-line no-restricted-imports
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;
