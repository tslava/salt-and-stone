import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox"],
  downloadsPath: process.cwd() + "/artifacts",
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
page.on("pageerror", (e) => console.error(e));
await page.goto("http://localhost:5187/?debug=1");
await page.waitForTimeout(400);
await page.screenshot({ path: "artifacts/01-title.png" });
await page.getByRole("button", { name: "Начать восхождение" }).click();
await page.waitForTimeout(1800);
await page.screenshot({ path: "artifacts/02-prototype.png" });
await page.goto("http://localhost:5187/?debug=1&art=clay");
await page.waitForTimeout(200);
await page.screenshot({ path: "artifacts/03-clay.png" });
await page.goto("http://localhost:5187/?debug=1&art=silhouette");
await page.waitForTimeout(200);
await page.screenshot({ path: "artifacts/04-silhouette.png" });
await browser.close();
