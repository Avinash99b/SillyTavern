# Android Chrome UI checks

The mobile polish changes `public/css/mobile-styles.css` and viewport/accessibility markup in `public/index.html`. The performance follow-up optimizes accessibility initialization in `public/scripts/keyboard.js` and scroll-button updates in `public/scripts/utils.js`. Generation logic, API configuration, storage, and extension interfaces remain unchanged.

## Run the regression checks

Use a disposable profile with the bundled default character and user accounts disabled. The tests select that character and exercise the editor. Do not run them against your everyday profile.

From the repository root, start the server:

```sh
MOBILE_TEST_DATA=$(mktemp -d)
node server.js --port 8000 --browserLaunchEnabled false --dataRoot "$MOBILE_TEST_DATA"
```

In another terminal:

```sh
cd tests
npm ci
npx playwright install chromium
npx playwright test frontend/MobileUI.e2e.js frontend/MobilePerformance.e2e.js --workers=1
```

The suite bypasses onboarding and automatic chat loading/connection in its intercepted settings response, and stubs the Horde model-list request. It does not make inference requests.

## Coverage

- All nine top-level drawers at 320×640, 360×740, 393×851, 412×915, 740×360, and 393×360; toolbar access, panel bounds, and horizontal control clipping.
- Message editing at 320px wide, including every editor action and cancellation without changing the message.
- Native touch scrolling through Chromium touch events.
- Multiline drafts across viewport reduction and rotation.
- Script execution and generation visibility rules, without making an API request.
- Long input popups with scrollable content and reachable actions.
- Visual novel mode with a long draft in compact and noncompact composer layouts.
- Asymmetric cutout and gesture insets through Chromium's safe-area emulation.
- Dynamic nested controls, extension-registered selectors, Enter activation, and tab-order restoration through disabled/not-focusable ancestors.
- Scroll-button threshold behavior, redundant class mutations, and cancellation of queued updates on cleanup.

The reproducible synthetic performance benchmark and its recorded results are in `tests/performance/`.

## Validation limits

These checks use Chromium with an Android user agent, touch input, and mobile viewport emulation. A reduced viewport checks the layout response to keyboard space; it does not emulate Gboard, Chrome's browser controls, or a physical device. Live generation, third-party extensions, and real-device performance are outside these UI checks.
