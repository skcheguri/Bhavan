// Runs once before the whole test file, and its afterEach hook runs
// after every test -- registered globally via vitest.config.ts's
// test.setupFiles, so individual test files don't need to import this.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
