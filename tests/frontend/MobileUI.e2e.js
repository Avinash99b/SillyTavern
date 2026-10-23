import { test, expect } from '@playwright/test';

// Run against a disposable local profile with the bundled default character.
test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
});

test.beforeEach(async ({ page }) => {
    // UI checks need neither onboarding nor an external inference service.
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

async function finishTransitions(locator) {
    await locator.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
}

async function expectInsideViewport(locator, page) {
    const rect = await locator.boundingBox();
    const viewport = page.viewportSize();
    expect(rect).not.toBeNull();
    expect(rect.x).toBeGreaterThanOrEqual(-1);
    expect(rect.y).toBeGreaterThanOrEqual(-1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function openDefaultChat(page) {
    await page.locator('#rightNavDrawerIcon').tap();
    await page.locator('.character_select').first().tap();
    if (await page.locator('#right-nav-panel').isVisible()) {
        await page.locator('#rightNavDrawerIcon').tap();
    }
    await expect(page.locator('#right-nav-panel')).toBeHidden();
    await expect(page.locator('#chat .mes[is_user="false"]').first()).toBeVisible();
}

const viewports = [
    { width: 320, height: 640 },
    { width: 360, height: 740 },
    { width: 393, height: 851 },
    { width: 412, height: 915 },
    { width: 740, height: 360 },
    { width: 393, height: 360 },
];

for (const viewport of viewports) {
    test(`all drawers fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const drawers = [
            'ai-config-button', 'sys-settings-button', 'advanced-formatting-button',
            'WI-SP-button', 'user-settings-button', 'backgrounds-button',
            'extensions-settings-button', 'persona-management-button', 'rightNavHolder',
        ];
        for (const id of drawers) {
            const toggle = page.locator(`#${id} > .drawer-toggle .drawer-icon`);
            await expectInsideViewport(toggle, page);
            await toggle.tap();
            const drawer = page.locator(`#${id} > .drawer-content`);
            await expect(drawer).toBeVisible();
            await finishTransitions(drawer);
            await expectInsideViewport(drawer, page);
            const clipped = await drawer.evaluate(element => [...element.querySelectorAll('.menu_button, input, select, textarea')]
                .filter(control => control.checkVisibility())
                .filter(control => {
                    const rect = control.getBoundingClientRect();
                    return rect.left < -1 || rect.right > innerWidth + 1;
                })
                .map(control => control.id || control.className));
            expect(clipped, `Controls clipped in ${id}`).toEqual([]);
            await toggle.tap();
            await expect(drawer).toBeHidden();
        }
    });
}

test('message editing keeps every action reachable and Cancel preserves the message', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openDefaultChat(page);
    const message = page.locator('#chat .mes[is_user="false"]').first();
    const original = await message.locator('.mes_text').innerText();
    await message.locator('.mes_edit').tap();
    const buttons = message.locator('.mes_edit_buttons .menu_button:visible');
    for (const button of await buttons.all()) {
        await expectInsideViewport(button, page);
    }
    await message.locator('.edit_textarea').fill('Temporary edit to cancel.');
    await message.locator('.mes_edit_cancel').tap();
    await expect(message.locator('.edit_textarea')).toHaveCount(0);
    await expect(message.locator('.mes_text')).toHaveText(original);
});

test('native touch scrolling works in a short chat viewport', async ({ page, context }) => {
    await page.setViewportSize({ width: 393, height: 400 });
    await openDefaultChat(page);
    const chat = page.locator('#chat');
    await chat.evaluate(element => { element.scrollTop = 0; });
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 280 }] });
    for (let step = 1; step <= 12; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 280 - step * 13 }] });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => chat.evaluate(element => element.scrollTop)).toBeGreaterThan(50);
});

test('a multiline draft fits after the viewport shrinks and survives rotation', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    const input = page.locator('#send_textarea');
    const draft = 'A line of a mobile draft.\n'.repeat(25);
    await input.fill(draft);
    for (const size of [{ width: 393, height: 360 }, { width: 740, height: 360 }]) {
        await page.setViewportSize(size);
        await expectInsideViewport(page.locator('#sheld'), page);
        await expectInsideViewport(input, page);
        await expectInsideViewport(page.locator('#options_button'), page);
        await expect(input).toHaveValue(draft);
        const box = await input.boundingBox();
        expect(box.height).toBeLessThanOrEqual(size.height * 0.4 + 1);
    }
});

test('script and generation visibility rules survive larger composer targets', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    // Reproduce connected controls without sending a request to an inference API.
    await page.evaluate(() => {
        document.querySelector('#send_but').classList.remove('displayNone');
        document.querySelector('#mes_continue').classList.remove('displayNone');
        document.querySelector('#form_sheld').classList.add('isExecutingCommandsFromChatInput');
    });
    await expect(page.locator('#send_but')).toBeHidden();
    await expect(page.locator('#mes_continue')).toBeHidden();
    expect(await page.locator('#send_but').evaluate(element => element.getBoundingClientRect().width)).toBe(0);
    await expect(page.locator('#stscript_pause')).toBeVisible();
    await expect(page.locator('#stscript_stop')).toBeVisible();
    await page.evaluate(() => {
        document.querySelector('#form_sheld').classList.remove('isExecutingCommandsFromChatInput');
        document.body.dataset.generating = 'true';
    });
    await expect(page.locator('#send_but')).toBeHidden();
    await expect(page.locator('#mes_continue')).toBeHidden();
});

test('long input popups keep their content scrollable and their actions on screen', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 360 });
    await page.evaluate(async () => {
        const { Popup } = await import('/scripts/popup.js');
        void Popup.show.input('Mobile input', '<p>Long popup content.</p>'.repeat(30), '', {
            wider: true, allowVerticalScrolling: true, cancelButton: true,
        });
    });
    const popup = page.locator('dialog.popup[open]');
    await expect(popup).toBeVisible();
    await finishTransitions(popup);
    await expectInsideViewport(popup, page);
    await expectInsideViewport(popup.locator('.popup-controls'), page);
    expect(await popup.locator('.popup-content').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await popup.locator('.popup-button-cancel').tap();
    await expect(popup).toHaveCount(0);
});

test('visual novel mode keeps a long draft and controls inside a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 360 });
    await page.evaluate(() => document.body.classList.add('waifuMode'));
    const input = page.locator('#send_textarea');
    await input.fill('A line in a visual novel draft.\n'.repeat(30));
    for (const compact of [true, false]) {
        await page.locator('#send_form').evaluate((element, enabled) => element.classList.toggle('compact', enabled), compact);
        await expectInsideViewport(input, page);
        await expectInsideViewport(page.locator('#options_button'), page);
        await expectInsideViewport(page.locator('#form_sheld'), page);
        expect(await page.locator('#chat').evaluate(element => element.clientHeight)).toBeGreaterThan(20);
    }
});

test('cutout and gesture insets protect toolbar, drawers, composer and popups', async ({ page, context }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 24, left: 48, right: 0, bottom: 16 } });
    expect((await page.locator('#leftNavDrawerIcon').boundingBox()).x).toBeGreaterThanOrEqual(48);
    expect((await page.locator('#options_button').boundingBox()).x).toBeGreaterThanOrEqual(48);
    const input = await page.locator('#send_textarea').boundingBox();
    expect(input.y + input.height).toBeLessThanOrEqual(344);
    await page.locator('#leftNavDrawerIcon').tap();
    await finishTransitions(page.locator('#left-nav-panel'));
    expect((await page.locator('#settings_preset').boundingBox()).x).toBeGreaterThanOrEqual(48);
    await page.locator('#leftNavDrawerIcon').tap();
    await expect(page.locator('#left-nav-panel')).toBeHidden();
    await page.evaluate(async () => {
        const { Popup } = await import('/scripts/popup.js');
        void Popup.show.input('Safe area input', '<p>Long content.</p>'.repeat(30), '', {
            wider: true, allowVerticalScrolling: true, cancelButton: true,
        });
    });
    const popup = page.locator('dialog.popup[open]');
    await expect(popup).toBeVisible();
    await finishTransitions(popup);
    const rect = await popup.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(48);
    expect(rect.y).toBeGreaterThanOrEqual(24);
    expect(rect.y + rect.height).toBeLessThanOrEqual(344);
});
