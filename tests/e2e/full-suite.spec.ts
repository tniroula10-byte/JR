import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots');

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 780 }
];

/**
 * Checks what matters on every screen without pinning copy that the client may still change:
 * the route renders (no redirect, no error boundary), has a heading, and never scrolls sideways.
 */
async function expectHealthyScreen(page: Page, pathname: string) {
  await expect(page).toHaveURL(new RegExp(`${pathname.replace(/\?.*/, '')}(\\?|$)`));
  await expect(page.locator('h1:visible, h2:visible').first(), `heading on ${pathname}`).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/something went wrong|application error/i);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(overflow, `no horizontal overflow on ${pathname} at ${vp.width}px`).toBe(false);
  }
}

async function screenshotBoth(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-desktop-1280.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-mobile-390.png`), fullPage: true });
}

test.describe('John Rambo — demo-mode screens, chat anonymity, guards and PWA', () => {
  test('every screen renders for customer, employee and boss at 360–1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.getByText('RAMBO', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-login-desktop-1280.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-login-mobile-390.png'), fullPage: true });

    const sections: Array<{ persona: string; routes: string[]; shots: string[] }> = [
      {
        persona: 'cust-1',
        routes: ['/home', '/topups', '/products', '/offers', '/chat', '/tickets', '/stories', '/announcements', '/notifications', '/profile'],
        shots: ['/home', '/products', '/chat', '/tickets']
      },
      {
        persona: 'emp-1',
        routes: ['/employee/dashboard', '/employee/inbox', '/employee/topups', '/employee/tickets', '/employee/offers', '/employee/boss-chat', '/employee/announcements', '/employee/performance', '/employee/invite-customer'],
        shots: ['/employee/dashboard', '/employee/inbox', '/employee/tickets']
      },
      {
        persona: 'boss-1',
        routes: ['/boss/dashboard', '/boss/inbox', '/boss/topups', '/boss/tickets', '/boss/analytics', '/boss/customers', '/boss/employees', '/boss/threads', '/boss/products', '/boss/stories', '/boss/announcements', '/boss/settings', '/boss/audit'],
        shots: ['/boss/dashboard', '/boss/inbox', '/boss/analytics', '/boss/settings']
      }
    ];

    for (const { persona, routes, shots } of sections) {
      await page.goto(`${routes[0]}?as=${persona}`);
      for (const route of routes) {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(route);
        await expectHealthyScreen(page, route);
        if (shots.includes(route)) {
          await screenshotBoth(page, route.slice(1).replace(/\//g, '-'));
        }
      }
    }

    // Customer home greets the signed-in customer by name
    await page.goto('/home?as=cust-1');
    await expect(page.getByText('Welcome back, Member 1')).toBeVisible();
  });

  test('chat between two browsers: staff see attribution, the customer only sees "John Rambo Support"', async ({
    browser
  }) => {
    const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const staffContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const customerPage = await customerContext.newPage();
    const staffPage = await staffContext.newPage();

    await customerPage.goto('/chat?as=cust-1');
    await expect(customerPage.getByRole('heading', { name: 'John Rambo Support' })).toBeVisible();

    const customerMsg = `E2E inquiry ${Date.now()}`;
    await customerPage.getByPlaceholder('Message John Rambo Support...').fill(customerMsg);
    await customerPage.getByRole('button', { name: 'Send' }).click();
    await expect(customerPage.getByText(customerMsg)).toBeVisible();

    await staffPage.goto('/employee/inbox?as=emp-1&conversationId=conv-1');
    await expect(staffPage.getByText(customerMsg).first()).toBeVisible();

    const staffReply = `E2E reply ${Date.now()}`;
    await staffPage
      .getByPlaceholder('Reply as John Rambo Support (attribution recorded internally)...')
      .fill(staffReply);
    await staffPage.getByRole('button', { name: 'Reply' }).click();
    await expect(staffPage.getByText(staffReply).first()).toBeVisible();
    await expect(staffPage.getByTestId('staff-attribution-badge').last()).toContainText('GUZ');

    await customerPage.reload();
    await expect(customerPage.getByText(staffReply).first()).toBeVisible();
    const customerHtml = await customerPage.content();
    expect(customerHtml).not.toContain('guz@johnrambo.us');
    expect(customerHtml).not.toContain('staff-attribution-badge');

    await customerContext.close();
    await staffContext.close();
  });

  test('route guards bounce wrong roles and suspended accounts; PWA files are served', async ({
    page,
    request
  }) => {
    await page.goto('/boss/dashboard?as=cust-1');
    await expect(page).toHaveURL(/\/home/);

    await page.goto('/home?as=cust-suspended');
    await expect(page).toHaveURL(/\/login\?error=account_suspended/);
    await expect(page.getByRole('alert').first()).toContainText('suspended');

    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.short_name).toBe('John Rambo');
    expect(manifestJson.icons.length).toBeGreaterThanOrEqual(3);

    const swRes = await request.get('/sw.js');
    expect(swRes.status()).toBe(200);
    expect(await swRes.text()).toContain('john-rambo-static-v1');
  });
});
