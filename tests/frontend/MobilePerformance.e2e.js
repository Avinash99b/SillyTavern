import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
    await page.route('**/api/settings/get', async route => {
        const response = await route.fetch();
        const data = await response.json();
        const settings = JSON.parse(data.settings);
        settings.firstRun = false;
        settings.power_user.auto_load_chat = false;
        settings.power_user.auto_connect = false;
        await route.fulfill({ response, json: { ...data, settings: JSON.stringify(settings) } });
    });
    await page.route('**/api/horde/text-models', route => route.fulfill({ json: [] }));
    await page.goto('/');
    await expect(page.locator('#preloader')).toHaveCount(0, { timeout: 30000 });
});

test('nested dynamic controls remain focusable and Enter activates once', async ({ page }) => {
    await page.evaluate(() => {
        const root = document.createElement('section');
        root.id = 'performance-fixture';
        document.querySelector('#chat').append(root);
        root.innerHTML = '<div><div id="dynamic-action" class="menu_button"><span>Dynamic action</span></div></div>';
        const control = root.querySelector('#dynamic-action');
        root.classList.add('fixture-updated');
        control.classList.add('fixture-updated');
        window.fixtureClickCount = 0;
        control.addEventListener('click', () => window.fixtureClickCount++);
    });
    const button = page.locator('#dynamic-action');
    await expect(button).toHaveAttribute('tabindex', '0');
    await button.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.fixtureClickCount)).toBe(1);
});

test('extension selectors initialize current and future controls', async ({ page }) => {
    await page.evaluate(async () => {
        const { registerInteractableType } = await import('/scripts/keyboard.js');
        const root = document.createElement('section');
        root.id = 'extension-fixture';
        root.innerHTML = '<div id="extension-existing" class="extension-action">Existing action</div>';
        document.querySelector('#chat').append(root);
        registerInteractableType('#extension-fixture .extension-action');
    });
    await expect(page.locator('#extension-existing')).toHaveAttribute('tabindex', '0');
    await page.evaluate(() => {
        document.querySelector('#extension-fixture').insertAdjacentHTML('beforeend', '<div id="extension-new" class="extension-action">New action</div>');
    });
    await expect(page.locator('#extension-new')).toHaveAttribute('tabindex', '0');
});

test('disabled ancestors preserve a custom tab order through repeated updates', async ({ page }) => {
    await page.evaluate(() => {
        const root = document.createElement('section');
        root.id = 'focus-fixture';
        root.innerHTML = '<div id="custom-tab-order" class="menu_button" tabindex="7">Custom action</div>';
        document.querySelector('#chat').append(root);
    });
    const button = page.locator('#custom-tab-order');
    await expect(button).toHaveAttribute('tabindex', '7');
    await page.locator('#focus-fixture').evaluate(element => element.classList.add('disabled'));
    await expect(button).not.toHaveAttribute('tabindex');
    for (let index = 0; index < 5; index++) {
        await button.evaluate(element => element.classList.toggle('fixture-updated'));
    }
    await page.locator('#focus-fixture').evaluate(element => element.classList.remove('disabled'));
    await expect(button).toHaveAttribute('tabindex', '7');
});

test('not-focusable ancestors and class changes update existing controls', async ({ page }) => {
    await page.evaluate(() => {
        const root = document.createElement('section');
        root.id = 'not-focusable-fixture';
        root.className = 'not_focusable';
        root.innerHTML = '<div id="initially-unfocusable" class="menu_button">Action</div><div id="class-added-later">Later action</div>';
        document.querySelector('#chat').append(root);
    });
    const button = page.locator('#initially-unfocusable');
    await expect(button).not.toHaveAttribute('tabindex');
    await page.locator('#not-focusable-fixture').evaluate(element => element.classList.remove('not_focusable'));
    await expect(button).toHaveAttribute('tabindex', '0');
    await page.locator('#class-added-later').evaluate(element => element.classList.add('menu_button'));
    await expect(page.locator('#class-added-later')).toHaveAttribute('tabindex', '0');
});

async function setupScrollFixture(page) {
    await page.evaluate(async () => {
        const { setupScrollToTop } = await import('/scripts/utils.js');
        const drawer = document.createElement('section');
        drawer.id = 'scroll-fixture';
        drawer.innerHTML = '<div id="scroll-content" style="height:100px;overflow:auto"><div style="height:1500px">Scrollable content</div></div><button id="scroll-button">Top</button>';
        document.querySelector('#chat').append(drawer);
        window.scrollButtonMutations = 0;
        new MutationObserver(records => window.scrollButtonMutations += records.length).observe(document.querySelector('#scroll-button'), { attributes: true, attributeFilter: ['class'] });
        window.cleanupScrollFixture = setupScrollToTop({ scrollContainerId: 'scroll-content', buttonId: 'scroll-button', drawerId: 'scroll-fixture' });
    });
}

test('scroll-to-top visibility changes only when crossing its threshold', async ({ page }) => {
    await page.clock.install();
    await setupScrollFixture(page);
    for (const offset of [10, 40, 70]) {
        await page.locator('#scroll-content').evaluate((element, top) => { element.scrollTop = top; element.dispatchEvent(new Event('scroll')); }, offset);
        await page.clock.runFor(300);
    }
    expect(await page.evaluate(() => window.scrollButtonMutations)).toBe(0);
    await page.locator('#scroll-content').evaluate(element => { element.scrollTop = 400; element.dispatchEvent(new Event('scroll')); });
    await page.clock.runFor(300);
    await expect(page.locator('#scroll-button')).toHaveClass('visible');
    for (const offset of [450, 500, 600]) {
        await page.locator('#scroll-content').evaluate((element, top) => { element.scrollTop = top; element.dispatchEvent(new Event('scroll')); }, offset);
        await page.clock.runFor(300);
    }
    expect(await page.evaluate(() => window.scrollButtonMutations)).toBe(1);
    await page.locator('#scroll-content').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
    await page.clock.runFor(300);
    await expect(page.locator('#scroll-button')).not.toHaveClass('visible');
    expect(await page.evaluate(() => window.scrollButtonMutations)).toBe(2);
});

test('scroll-to-top cleanup cancels a pending trailing update', async ({ page }) => {
    await page.clock.install();
    await setupScrollFixture(page);
    await page.locator('#scroll-content').evaluate(element => { element.scrollTop = 400; element.dispatchEvent(new Event('scroll')); });
    await page.clock.runFor(1000);
    await expect(page.locator('#scroll-button')).toHaveClass('visible');
    await page.evaluate(() => {
        const content = document.querySelector('#scroll-content');
        content.scrollTop = 450;
        content.dispatchEvent(new Event('scroll'));
        content.scrollTop = 0;
        content.dispatchEvent(new Event('scroll'));
        window.cleanupScrollFixture();
    });
    await page.clock.runFor(1000);
    await expect(page.locator('#scroll-button')).toHaveClass('visible');
    expect(await page.evaluate(() => window.scrollButtonMutations)).toBe(1);
});
