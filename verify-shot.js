/* Real-frame verify shot: load index.html at a pinned scroll progress, let the
   intro + several rAF frames render, screenshot, report console errors.
   Usage: node verify-shot.js <p> <outfile>   e.g. node verify-shot.js 0 reference/clone-brain.png
   Needs: `npm install` (playwright-core) + a locally-installed Google Chrome.
   Custom binary: set CHROME_PATH=/path/to/chrome. Dev-only, not part of the runtime. */
const { chromium } = require("playwright-core");
const path = require("path");

const P = process.argv[2] ?? "0";
const OUT = process.argv[3] ?? "reference/_shot.png";
const CHROME = process.env.CHROME_PATH || "";           // optional explicit binary path

(async () => {
  const browser = await chromium.launch({
    // portable: use the system Google Chrome (channel), or an explicit CHROME_PATH
    ...(CHROME ? { executablePath: CHROME } : { channel: "chrome" }),
    args: ["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader",
           "--ignore-gpu-blocklist","--allow-file-access-from-files"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  const url = "file://" + path.resolve(__dirname, "index.html") + "?test&p=" + P;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);                       // intro + slow software-WebGL scrollP convergence
  await page.screenshot({ path: path.resolve(__dirname, OUT) });
  await browser.close();
  console.log("shot -> " + OUT + "   console errors: " + (errs.length ? "\n  " + errs.join("\n  ") : "0"));
})();
