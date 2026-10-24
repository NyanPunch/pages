# Browser regression checks

Run from the repository root with Python 3.10+:

```sh
python3 -m pip install -r tests/requirements.txt
python3 -m playwright install chromium
python3 tests/browser_smoke.py
```

If system Chromium is installed, the runner uses it automatically. Set `CHROMIUM_PATH` to select another executable. Otherwise it uses the Playwright-managed browser. Linux environments may also need Playwright's documented browser system dependencies.

The runner starts its own local HTTP server on an available port. Every test uses a fresh browser context; it does not modify the repository or existing browser data. External requests are blocked and draw responses are fixtures. These tests demonstrate application behavior, not the live data provider's availability. To validate the live provider separately, open `showmethemoney/` through a local static server with normal TLS verification and confirm the displayed rounds, draw dates, and published numbers.

Coverage includes:

- Income and expense entry, editing, deletion, period totals, search, and persistent month filtering
- Legacy storage migration while preserving original keys and recovering referenced categories
- Safe text rendering, category management, and protection of categories in use
- Actual file download and restore, invalid data rejection, canceled restore, and pre-restore recovery copy
- Corrupt storage preservation, recovery export, and failed-write handling
- Lotto and pension data rendering, leading zeros, original number generators, cached fallback, stale results, and independent validation failures
- Prevention of the home page interpreting private tool storage as editable notes
- Mobile document width and accessible category/transaction dialogs

Onboarding's older helper outside the repository targets the previous MoneyDash DOM. Use this repository-owned suite after the rebuild.

## Rain comparison prototype

```sh
node --test tests/rain-forecast.test.mjs
python3 tests/rain_browser.py
```

These are independent of the existing MoneyDash/lottery suite. Weather API responses and geolocation are simulated; actual device positioning, live API availability/CORS, and meteorological forecast accuracy require separate verification. The rain page and model-comparison method are documented in [isitraining/README.md](../isitraining/README.md).
