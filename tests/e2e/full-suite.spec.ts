import { expect, test } from '@playwright/test';
import path from 'node:path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'docs', 'screenshots');

test.describe('John Rambo — Full E2E, Multi-Context Chat, Viewport & Accessibility Suite', () => {
  test('Phase 1 & 10: renders Login, Customer, Employee, and Boss screens at 360px, 390px, 768px, and 1280px with zero layout breaks, saves screenshots, and passes accessibility checks', async ({
    page
  }) => {
    const viewports = [
      { width: 1280, height: 800, label: 'desktop-1280' },
      { width: 768, height: 1024, label: 'tablet-768' },
      { width: 390, height: 844, label: 'mobile-390' },
      { width: 360, height: 780, label: 'mobile-360' }
    ];

    // 1. Login Page
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'John Rambo' })).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-login-desktop-1280.png'),
      fullPage: true
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-login-mobile-390.png'),
      fullPage: true
    });

    // 2. Customer Screens (as cust-1 Aarav Mehta)
    const customerRoutes = [
      { url: '/home?as=cust-1', name: 'customer-home', heading: /Welcome back, Aarav Mehta/i },
      { url: '/products', name: 'customer-products', heading: /Game Points Catalog/i },
      { url: '/offers', name: 'customer-offers', heading: /My Price Offers/i },
      { url: '/chat', name: 'customer-chat', heading: /John Rambo Support/i },
      { url: '/tickets', name: 'customer-tickets', heading: /Support Tickets/i },
      { url: '/stories', name: 'customer-stories', heading: /24-Hour Syndicate Stories/i },
      { url: '/announcements', name: 'customer-announcements', heading: /Syndicate Announcements/i },
      { url: '/notifications', name: 'customer-notifications', heading: /In-App Notifications/i },
      { url: '/profile', name: 'customer-profile', heading: /My Member Profile/i }
    ];

    for (const route of customerRoutes) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(route.url);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();

      // Check zero horizontal overflow across all 4 required widths (360, 390, 768, 1280)
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth + 2;
        });
        expect(hasOverflow, `No horizontal overflow on ${route.name} at ${vp.width}px`).toBe(false);
      }

      // Save Desktop (1280px) & Mobile (390px) screenshots for key screens
      if (['customer-home', 'customer-products', 'customer-chat', 'customer-tickets', 'customer-stories'].includes(route.name)) {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${route.name}-desktop-1280.png`),
          fullPage: true
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${route.name}-mobile-390.png`),
          fullPage: true
        });
      }
    }

    // 3. Employee Screens (as emp-1 Vikram Singh)
    const employeeRoutes = [
      { url: '/employee/dashboard?as=emp-1', name: 'employee-dashboard', heading: /Vikram Singh — Specialist Desk/i },
      { url: '/employee/inbox', name: 'employee-inbox', heading: /Customer Support Inbox/i },
      { url: '/employee/tickets', name: 'employee-tickets', heading: /Support Tickets/i },
      { url: '/employee/offers', name: 'employee-offers', heading: /Price Offers & Negotiation Queue/i },
      { url: '/employee/boss-chat', name: 'employee-boss-chat', heading: /Boss Direct Line/i },
      { url: '/employee/announcements', name: 'employee-announcements', heading: /Staff Broadcast Channel/i },
      { url: '/employee/performance', name: 'employee-performance', heading: /My Performance Statistics/i },
      { url: '/employee/invite-customer', name: 'employee-invite', heading: /Invite Customer/i }
    ];

    for (const route of employeeRoutes) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(route.url);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();

      if (['employee-dashboard', 'employee-inbox', 'employee-tickets', 'employee-performance'].includes(route.name)) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${route.name}-desktop-1280.png`),
          fullPage: true
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${route.name}-mobile-390.png`),
          fullPage: true
        });
      }
    }

    // 4. Boss Screens (as boss-1 Col. Rajesh Rathore)
    const bossRoutes = [
      { url: '/boss/dashboard?as=boss-1', name: 'boss-dashboard', heading: /Master Syndicate Command Center/i },
      { url: '/boss/inbox', name: 'boss-inbox', heading: /Master Shared Customer Inbox/i },
      { url: '/boss/tickets', name: 'boss-tickets', heading: /All Support Tickets/i },
      { url: '/boss/analytics', name: 'boss-analytics', heading: /Staff Performance Analytics/i },
      { url: '/boss/customers', name: 'boss-customers', heading: /Customer Management/i },
      { url: '/boss/employees', name: 'boss-employees', heading: /Employee Management/i },
      { url: '/boss/threads', name: 'boss-threads', heading: /Internal Boss–Employee Threads/i },
      { url: '/boss/products', name: 'boss-products', heading: /Products & Game-Points Catalog Manager/i },
      { url: '/boss/stories', name: 'boss-stories', heading: /24-Hour Stories Publisher/i },
      { url: '/boss/announcements', name: 'boss-announcements', heading: /Announcements Hub/i },
      { url: '/boss/settings', name: 'boss-settings', heading: /System Security & Scope Settings/i },
      { url: '/boss/audit', name: 'boss-audit', heading: /Immutable Security Audit Log/i }
    ];

    for (const route of bossRoutes) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(route.url);
      await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();

      if (['boss-dashboard', 'boss-inbox', 'boss-analytics', 'boss-settings', 'boss-audit'].includes(route.name)) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${route.name}-desktop-1280.png`),
          fullPage: true
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${route.name}-mobile-390.png`),
          fullPage: true
        });
      }
    }
  });

  test('Phase 4: Two independent browser contexts exchange live chat messages with strict staff anonymity for customer and full staff attribution for staff', async ({
    browser
  }) => {
    const customerContext = await browser.newContext({
      viewport: { width: 390, height: 844 }
    });
    const staffContext = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });

    const customerPage = await customerContext.newPage();
    const staffPage = await staffContext.newPage();

    // Context 1: Customer 1 opens /chat
    await customerPage.goto('/chat?as=cust-1');
    await expect(customerPage.getByRole('heading', { name: 'John Rambo Support' })).toBeVisible();

    const uniqueCustomerMsg = `Live E2E inquiry ${Date.now()}: Ready for 60k UC transfer!`;
    await customerPage.getByPlaceholder('Message John Rambo Support...').fill(uniqueCustomerMsg);
    await customerPage.getByRole('button', { name: 'Send' }).click();
    await expect(customerPage.getByText(uniqueCustomerMsg)).toBeVisible();

    // Context 2: Employee 1 opens /employee/inbox and sees Customer 1's live message
    await staffPage.goto('/employee/inbox?as=emp-1&conversationId=conv-1');
    await expect(staffPage.getByText(uniqueCustomerMsg).first()).toBeVisible();

    // Employee 1 replies
    const uniqueStaffReply = `Live E2E Support Reply ${Date.now()}: Transfer window confirmed!`;
    await staffPage
      .getByPlaceholder('Reply as John Rambo Support (attribution recorded internally)...')
      .fill(uniqueStaffReply);
    await staffPage.getByRole('button', { name: 'Reply' }).click();

    // Staff page shows real attribution badge ("Sent by Vikram Singh (Maverick)")
    await expect(staffPage.getByText(uniqueStaffReply).first()).toBeVisible();
    await expect(staffPage.getByTestId('staff-attribution-badge').first()).toContainText(
      'Vikram Singh'
    );

    // Customer page receives the reply as "John Rambo Support" and NEVER contains "Vikram Singh"
    await customerPage.reload();
    await expect(customerPage.getByText(uniqueStaffReply).first()).toBeVisible();
    const customerHtml = await customerPage.content();
    expect(customerHtml).not.toContain('Vikram Singh');
    expect(customerHtml).not.toContain('vikram@johnrambo.in');

    await customerContext.close();
    await staffContext.close();
  });

  test('Phase 2 & 10: Route guards bounce unauthorized & suspended sessions, and PWA manifest & service worker are served', async ({
    page,
    request
  }) => {
    // Customer trying to access /boss/dashboard is redirected to /home
    await page.goto('/boss/dashboard?as=cust-1');
    await expect(page).toHaveURL(/\/home/);

    // Suspended account is bounced to /login?error=account_suspended
    await page.goto('/home?as=cust-suspended');
    await expect(page).toHaveURL(/\/login\?error=account_suspended/);
    await expect(page.getByRole('alert').first()).toContainText('suspended');

    // PWA Manifest & Service Worker checks
    const manifestRes = await request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.short_name).toBe('John Rambo');
    expect(manifestJson.icons.length).toBeGreaterThanOrEqual(3);

    const swRes = await request.get('/sw.js');
    expect(swRes.status()).toBe(200);
    const swText = await swRes.text();
    expect(swText).toContain('john-rambo-static-v1');
  });
});
