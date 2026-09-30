# Settings layout browser regression

These checks open the real admin pages in a browser and intercept API requests with
isolated fixtures. They never update live accounts or groups.

Start Vite in one terminal:

    pnpm dev --host 127.0.0.1 --port 3001

Then run:

    pnpm test:e2e:settings

Windows uses installed Microsoft Edge. On Linux/macOS, install Chromium first:

    pnpm exec playwright install chromium

E2E_BROWSER_CHANNEL overrides the browser channel, and E2E_BASE_URL overrides the
default server address. Set E2E_SCREENSHOT_DIR to retain desktop, mobile and
light-theme screenshots.

Coverage includes editing and creating accounts, changing providers, batch updates,
group settings, quality-rule drawers, 120 selected models, native validation across hidden panels,
keyboard navigation, guided-tour target reveal, retaining unsaved values, submitted
payloads, and fixed save actions at desktop, tablet, phone and short-window sizes.
