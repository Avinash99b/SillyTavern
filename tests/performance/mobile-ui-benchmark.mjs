import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const baselineRef = process.argv[2] || '394e5b632a44134a8565be76ade4de9f832ef9ab';
const baseURL = process.env.ST_BENCH_URL || 'http://127.0.0.1:8000';
const repository = fileURLToPath(new URL('../../', import.meta.url));

const before = Object.fromEntries(['keyboard', 'utils'].map(name => [name, execFileSync('git', ['show', `${baselineRef}:public/scripts/${name}.js`], { cwd: repository, encoding: 'utf8' })]));
const browser = await chromium.launch();
const runs = [];

function instrumentLabel(result) {
    return result.instrument ? 'query count' : 'timing';
}

async function sample(variant, instrument = false) {
    const context = await browser.newContext({
        viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
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
    if (variant === 'before') {
        for (const [name, source] of Object.entries(before)) {
            await page.route(`**/scripts/${name}.js`, route => route.fulfill({ body: source, contentType: 'text/javascript' }));
        }
    }
    if (instrument) {
        await page.addInitScript(() => {
            window.perfQueryCount = 0;
            for (const prototype of [Element.prototype, Document.prototype]) {
                const original = prototype.querySelectorAll;
                prototype.querySelectorAll = function (...args) {
                    window.perfQueryCount++;
                    return Reflect.apply(original, this, args);
                };
            }
        });
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    await page.goto(baseURL);
    await page.locator('#preloader').waitFor({ state: 'detached', timeout: 60000 });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
    const stages = {};
    for (const stage of ['insert', 'updates']) {
        const start = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const elapsed = await page.evaluate(async stage => {
            window.perfQueryCount = 0;
            const start = performance.now();
            if (stage === 'insert') {
                const root = document.createElement('section');
                root.id = 'perf-fixture';
                root.className = 'scroll-reset-container';
                root.style.cssText = 'position:fixed;left:-10000px;top:0;width:350px';
                let html = '';
                for (let i = 0; i < 200; i++) {
                    html += '<article class="mes"><div class="mes_text"><p>A synthetic chat message with readable content.</p></div><div class="mes_buttons">';
                    for (let j = 0; j < 8; j++) html += '<button class="menu_button"><span>Action</span></button>';
                    html += '</div></article>';
                }
                root.innerHTML = html;
                document.body.append(root);
            } else {
                const root = document.querySelector('#perf-fixture');
                const message = root.lastElementChild;
                const controls = message.querySelectorAll('.menu_button');
                for (let i = 0; i < 100; i++) {
                    message.classList.toggle('perf-update');
                    message.firstElementChild.classList.toggle('perf-update');
                    controls.forEach(control => control.classList.toggle('perf-update'));
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            await new Promise(resolve => setTimeout(resolve, 0));
            return { elapsedMs: performance.now() - start, queries: window.perfQueryCount };
        }, stage);
        const end = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        stages[stage] = { ...elapsed, scriptMs: (end.ScriptDuration - start.ScriptDuration) * 1000,
            taskMs: (end.TaskDuration - start.TaskDuration) * 1000,
            layouts: end.LayoutCount - start.LayoutCount };
    }
    await context.close();
    return { variant, instrument, ...stages };
}

try {
    for (let i = 0; i < 4; i++) {
        for (const variant of (i % 2 ? ['after', 'before'] : ['before', 'after'])) {
            const result = await sample(variant);
            runs.push(result);
            console.error(`${variant}: ${instrumentLabel(result)} sample complete`);
        }
    }
    for (const variant of ['before', 'after']) {
        const result = await sample(variant, true);
        runs.push(result);
        console.error(`${variant}: ${instrumentLabel(result)} sample complete`);
    }
    process.stdout.write(JSON.stringify({ baselineRef, browser: browser.version(), viewport: { width: 393, height: 851 }, cpuThrottle: 4, runs }, null, 2) + '\n');
} finally {
    await browser.close();
}
