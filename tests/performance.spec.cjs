const { test, expect } = require('@playwright/test');
test.describe('Large Chat Performance Profiling', () => {
    test('UI should remain responsive with thousands of messages', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/');
        await page.waitForSelector('#chat', { timeout: 10000 });
        try { await page.locator('.popup').last().waitFor({ state: 'hidden', timeout: 5000 }); } catch(e) {}
        await page.evaluate(() => {
            document.querySelectorAll('.popup').forEach(p => p.style.display = 'none');
            document.querySelectorAll('.splash-screen').forEach(p => p.style.display = 'none');
            window.online_status = 'connected';
            const statusIndicator = document.querySelector('.online_status_indicator');
            if (statusIndicator) statusIndicator.classList.add('success');
            const statusText = document.querySelector('.online_status_text');
            if (statusText) statusText.innerText = 'Connected';
            document.getElementById('send_textarea').removeAttribute('disabled');

            const mockChat = [];
            for (let i = 0; i < 5000; i++) {
                mockChat.push({ name: 'User', is_user: true, mes: 'Mock text', extra: {} });
            }
            const chatElement = document.getElementById('chat');
            chatElement.innerHTML = mockChat.map((m, i) => `<div class="mes" mesid="${i}"><div class="mes_block"><div class="mes_text">${m.mes}</div></div></div>`).join('');
            chatElement.scrollTop = chatElement.scrollHeight;
        });

        const metrics = await page.evaluate(async () => {
            const ta = document.getElementById('send_textarea');

            const t0 = performance.now();
            ta.focus();
            const focusLatency = performance.now() - t0;

            const t1 = performance.now();
            ta.value = 'Hello';
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            const typingLatency = performance.now() - t1;

            const t2 = performance.now();
            document.getElementById('chat').click(); // blur
            const blurLatency = performance.now() - t2;

            return { focusLatency, typingLatency, blurLatency };
        });

        console.log(metrics);
        expect(metrics.focusLatency).toBeLessThan(50);
        expect(metrics.typingLatency).toBeLessThan(50);
        expect(metrics.blurLatency).toBeLessThan(50);
    });
});
