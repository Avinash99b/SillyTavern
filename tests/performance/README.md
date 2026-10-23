# Mobile UI performance follow-up

This pass reduces work in UI helpers while keeping generation, APIs, storage, and extension registration interfaces unchanged:

- Keyboard initialization uses one cached selector list, returning each control once. The mutation observer coalesces repeated targets and skips descendant scans already covered by an ancestor in the same delivery. Initialization still finishes during that observer delivery.
- Disabled controls keep their saved tab order through repeated updates, without rewriting it when `tabindex` is already absent.
- Scroll-to-top visibility writes a class only when the state changes. Resize callbacks share a pending animation frame, and cleanup cancels queued frames and trailing throttled callbacks.

## Recorded benchmark

Chromium 141.0.7390.37, 393×851 mobile viewport with touch enabled, 4× CPU throttling. The baseline uses `keyboard.js` and `utils.js` from commit `394e5b632a44134a8565be76ade4de9f832ef9ab`; all other application files are identical between variants, including the earlier UI polish. Four uninstrumented timing samples per variant were interleaved before/after. Query counts were measured separately, once per variant.

The fixture inserts 200 synthetic message cards with eight controls each, outside the visible viewport. It then performs 100 batches of nested class changes. This isolates observer and control-initialization work; it does not benchmark rendering an actual chat, token generation, network speed, or physical Android hardware.

| Metric | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Insertion: median scripting time | 278.05 ms | 172.13 ms | 38.1% |
| Updates: median scripting time | 170.21 ms | 47.70 ms | 72.0% |
| Insertion: median main-thread task duration | 592.06 ms | 533.67 ms | 9.9% |
| Updates: median main-thread task duration | 237.72 ms | 73.07 ms | 69.3% |
| Insertion: selector queries | 44,837 | 3,211 | 92.8% |
| Updates: selector queries | 28,001 | 201 | 99.3% |

Times and counts are measured. Reductions are calculated from those measurements. Timing varies with host load and this synthetic workload; these percentages are not whole-app Android speedup claims. Raw samples and metadata are in `mobile-ui-results.json`.

## Reproduce

Start a server on port 8000 with a disposable profile, as described in `tests/MOBILE_UI.md`. Install test dependencies and Chromium, then run from the repository root:

```sh
node tests/performance/mobile-ui-benchmark.mjs > /tmp/mobile-ui-benchmark.json
```

Pass another baseline commit as the first argument if needed. Set `ST_BENCH_URL` to use another local server address. The script intercepts only the baseline UI helper sources for comparison, bypasses onboarding and auto-connection in the test settings response, and stubs the Horde model list. It leaves repository sources untouched and does not call an inference API.

The separate `MobilePerformance.e2e.js` suite checks focus behavior, dynamic extension controls, disabled tab-order restoration, and scroll-button lifecycle behavior. It intentionally has no timing thresholds.
