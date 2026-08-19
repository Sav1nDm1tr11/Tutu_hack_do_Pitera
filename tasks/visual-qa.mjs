import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/* global document, getComputedStyle */

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3001';
const outputDir = new URL('../.impeccable/review/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const browserDiagnostics = [];

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    browserDiagnostics.push({ type: 'pageerror', message: error.message }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserDiagnostics.push({ type: 'console', message: message.text() });
    }
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: fileURLToPath(new URL('search-desktop.png', outputDir)),
    fullPage: true,
  });

  const searchA11y = await new AxeBuilder({ page }).analyze();

  await page.getByRole('combobox', { name: 'Откуда', exact: true }).fill('Екатеринбург');
  await page.getByRole('option', { name: 'Екатеринбург' }).click();
  await page.getByRole('combobox', { name: 'Куда', exact: true }).fill('Санкт-Петербург');
  await page.getByRole('option', { name: 'Санкт-Петербург' }).click();
  await page.getByLabel('Дата возвращения').fill('2026-08-25');
  await page.getByRole('button', { name: 'Собрать устойчивый маршрут' }).click();
  await page.waitForURL(/\/plan\//, { timeout: 75_000 });
  await page.getByText('Живая карта маршрута').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-intro]').first().waitFor({ state: 'visible' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-intro]')].every((element) => {
      const style = getComputedStyle(element);
      return style.filter === 'none' && Number(style.opacity) > 0.99;
    }),
  );
  await page.screenshot({
    path: fileURLToPath(new URL('plan-desktop.png', outputDir)),
    fullPage: true,
  });

  const routeLabels = await page.locator('.route-map-marker__label').allTextContents();
  const mapDiagnostics = await page.evaluate(() => ({
    planets: document.querySelectorAll('.route-planet__svg').length,
    markers: document.querySelectorAll('.route-map-marker').length,
    routePaths: document.querySelectorAll('.route-planet__route').length,
    textEquivalent: document.querySelector('.globe-map-shell .visually-hidden')?.textContent,
  }));
  const planA11y = await new AxeBuilder({ page }).analyze();
  const contrastDiagnostics = await page.locator('.summary-action').evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, backgroundColor: style.backgroundColor, fontSize: style.fontSize };
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByText('Живая карта маршрута').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-intro]')].every((element) => {
      const style = getComputedStyle(element);
      return style.filter === 'none' && Number(style.opacity) > 0.99;
    }),
  );
  await page.screenshot({
    path: fileURLToPath(new URL('plan-mobile.png', outputDir)),
    fullPage: true,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        url: page.url(),
        title: await page.title(),
        routeLabels,
        mapDiagnostics,
        browserDiagnostics,
        contrastDiagnostics,
        searchA11yViolations: summarizeViolations(searchA11y.violations),
        planA11yViolations: summarizeViolations(planA11y.violations),
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  console.error(JSON.stringify({ browserDiagnostics }, null, 2));
  throw error;
} finally {
  await browser.close();
}

function summarizeViolations(violations) {
  return violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.slice(0, 4).map(({ target, failureSummary, html }) => ({
      target,
      failureSummary,
      html,
    })),
  }));
}
