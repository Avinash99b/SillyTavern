1. **Fix Playwright Performance Test**:
   - Write `tests/performance.spec.cjs` using the following bash command:
     ```bash
     cat << 'SCRIPT_EOF' > tests/performance.spec.cjs
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
     SCRIPT_EOF
     ```

2. **Fix `MutationObserver` Initialization in `RossAscends-mods.js`**:
   - Replace lines 70-87 in `public/scripts/RossAscends-mods.js` using a git merge diff with the following code:
     ```javascript
<<<<<<< SEARCH
    mutations.forEach(function (mutation) {
        if (!(mutation.target instanceof HTMLElement)) {
            return;
        }
        if (mutation.target.classList.contains('online_status_text')) {
            checkStatusDebounced();
        } else if (mutation.target.parentNode === SelectedCharacterTab) {
            countTokensShortDebounced();
        } else if (mutation.target.classList.contains('mes_text')) {
            for (const element of mutation.target.getElementsByTagName('math')) {
                element.childNodes.forEach(function (child) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        child.textContent = '';
                    }
                });
            }
        }
    });
=======
    mutations.forEach(function (mutation) {
        if (!(mutation.target instanceof HTMLElement)) {
            return;
        }
        if (mutation.target.classList.contains('online_status_text')) {
            checkStatusDebounced();
        } else if (typeof SelectedCharacterTab !== 'undefined' && SelectedCharacterTab && SelectedCharacterTab.contains(mutation.target)) {
            countTokensShortDebounced();
        } else if (mutation.target.classList.contains('mes_text')) {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    if (node.tagName === 'MATH') {
                        node.childNodes.forEach(function (child) {
                            if (child.nodeType === Node.TEXT_NODE) {
                                child.textContent = '';
                            }
                        });
                    } else {
                        for (const element of node.getElementsByTagName('math')) {
                            element.childNodes.forEach(function (child) {
                                if (child.nodeType === Node.TEXT_NODE) {
                                    child.textContent = '';
                                }
                            });
                        }
                    }
                }
            });
        }
    });
>>>>>>> REPLACE
     ```

3. **Run all relevant tests**:
   - Run `kill $(lsof -t -i :8000) 2>/dev/null || true && node server.js & sleep 3 && npx playwright test tests/performance.spec.cjs`.
   - Run `node -c public/scripts/RossAscends-mods.js`.

4. **Complete pre-commit steps**:
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

5. **Submit**:
   - Submit the changes.
