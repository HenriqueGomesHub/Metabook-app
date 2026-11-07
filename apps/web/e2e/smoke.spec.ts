import { expect, test } from '@playwright/test';

test('home renders the main navigation', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(5);
});
