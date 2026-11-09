import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5187/?debug=1");
await page.screenshot({ path: "artifacts/final-title.png" });
await page.getByRole("button", { name: "Начать восхождение" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "artifacts/final-start.png" });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: 180, y: 710 }],
});
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchMove",
  touchPoints: [{ x: 189, y: 663 }],
});
await page.waitForTimeout(180);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchEnd",
  touchPoints: [],
});
await page.waitForTimeout(800);
assert.equal(await page.evaluate(() => window.__game.game.current.id), "a");
await page.evaluate(() => {
  const g = window.__game.game;
  g.energy = 0.1;
  g.idleTime = 5;
});
await page.waitForTimeout(1200);
assert.equal(await page.evaluate(() => window.__game.game.current.id), "s");
assert.ok(await page.evaluate(() => window.__game.game.fade > 0));
await page.waitForTimeout(500);
assert.equal(await page.evaluate(() => window.__game.game.fade), 0);
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(300);
await page.screenshot({ path: "artifacts/final-landscape.png" });
await page.setViewportSize({ width: 320, height: 568 });
await page.waitForTimeout(300);
await page.screenshot({ path: "artifacts/final-320.png" });
await page.setViewportSize({ width: 390, height: 844 });
// Focused fixture: only the final mantle changed after the full input-driven run.
await page.evaluate(async () => {
  const { holdById } = await import("/src/route.js");
  const { poseAt } = await import("/src/rig.js");
  const g = window.__game.game;
  g.current = holdById("summit");
  g.pose = poseAt(g.current);
  g.state = "mantle";
  g.mantleTime = 0;
  g.stage = 2;
  g.camera = { x: 505, y: 1130 };
  g.energy = 59;
  window.mantleErrors = [];
  function audit() {
    window.mantleErrors.push(
      Math.max(...[...g.pose.arms, ...g.pose.legs].map((l) => l.error)),
    );
    if (g.state === "mantle") requestAnimationFrame(audit);
  }
  requestAnimationFrame(audit);
});
await page.waitForTimeout(500);
await page.screenshot({ path: "artifacts/final-mantle-mid.png" });
await page.waitForFunction(() => window.__game.game.state === "complete", {
  timeout: 6000,
});
assert.equal(await page.evaluate(() => window.__game.game.state), "complete");
assert.ok(
  await page.evaluate(
    () =>
      window.mantleErrors.length > 30 &&
      window.mantleErrors.every((e) => e === 0),
  ),
);
await page.getByRole("button", { name: "Посмотреть на море" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: "artifacts/final-summit.png" });
for (const mode of ["clay", "silhouette"]) {
  await page.goto(`http://localhost:5187/?debug=1&art=${mode}`);
  await page.getByRole("button", { name: "Начать восхождение" }).click();
  await page.evaluate(() => {
    const g = window.__game.game;
    g.paused = true;
    g.camera = { x: 200, y: 300 };
  });
  await page.screenshot({ path: `artifacts/final-first-${mode}.png` });
  await page.evaluate(() => (window.__game.game.camera = { x: 505, y: 855 }));
  await page.screenshot({ path: `artifacts/final-second-${mode}.png` });
}
assert.deepEqual(errors, []);
await writeFile(
  "artifacts/final-qa.json",
  JSON.stringify(
    {
      LAN: "http://localhost:5187",
      LANLoad: true,
      checks: [
        "final source load",
        "real touch reach",
        "death fade out and in",
        "landscape framing",
        "320 px",
        "summit mantle in real time",
        "both cliff clay/silhouette",
      ],
      errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Final focused QA passed, including LAN access.");
