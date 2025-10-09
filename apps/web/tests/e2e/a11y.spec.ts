import { test } from '@playwright/test';

test.describe('accessibility audit', () => {
  test.skip(true, 'Requires running Next.js app and API.');
});
