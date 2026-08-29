import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

import { installBrowserApiMocks, resetBrowserApiMocks } from '../client/helpers/browser-api-mocks';

beforeAll(() => {
  installBrowserApiMocks();
});

afterEach(() => {
  cleanup();
  resetBrowserApiMocks();
});
