import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const cdp = await page.context().newCDPSession(page);
await page.goto("http://localhost:5187/?debug=1");
await page.getByRole("button", { name: "Начать восхождение" }).click();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  window.samples = [];
  function sample() {
    const { game: g } = window.__game;
    window.samples.push({
      time: performance.now(),
      state: g.state,
      body: g.pose.body,
      hands: g.pose.hands,
      feet: g.pose.feet,
      errors: [...g.pose.arms, ...g.pose.legs].map((l) => l.error),
    });
    if (window.samples.length < 4000) requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
});
await mkdir("artifacts/prototype-motion", { recursive: true });
let i = 0;
const writes = [];
cdp.on("Page.screencastFrame", async (e) => {
  const id = i++;
  writes.push(
    writeFile(
      `artifacts/prototype-motion/${String(id).padStart(5, "0")}.jpg`,
      Buffer.from(e.data, "base64"),
    ),
  );
  await cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId });
});
await cdp.send("Page.startScreencast", {
  format: "jpeg",
  quality: 70,
  maxWidth: 390,
  maxHeight: 844,
  everyNthFrame: 2,
});
for (const [id, dx, dy] of [
  ["a", 9, 47],
  ["b", 48, 20],
  ["c", 97, 56],
  ["r1", 21, 47],
]) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 180, y: 710 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 180 + dx, y: 710 - dy }],
  });
  await page.waitForTimeout(850);
  const p = await page.evaluate(() => window.__game.game.gesture.preview);
  assert.equal(p.to, id);
  assert.equal(p.ready, true);
  await page.screenshot({ path: `artifacts/prototype-${id}-preview.png` });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(260);
  await page.screenshot({ path: `artifacts/prototype-${id}-motion.png` });
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__game.game.current.id), id);
}
await page.waitForTimeout(1200);
await cdp.send("Page.stopScreencast");
await Promise.all(writes);
const samples = await page.evaluate(() => window.samples);
await writeFile("artifacts/prototype-samples.json", JSON.stringify(samples));
const report = await page.evaluate(() => ({
  moves: window.__game.game.moves,
  energy: window.__game.game.energy,
  errors: window.__game.metrics.errors,
  frames: window.__game.metrics.frames,
}));
assert.equal(report.moves, 4);
assert.deepEqual(report.errors, []);
assert.ok(samples.every((s) => s.errors.every((e) => e < 0.01)));
console.log(
  JSON.stringify({
    ...report,
    motionFrames: samples.filter((s) => s.state === "move").length,
    capturedFrames: i,
  }),
);
await browser.close();
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-framerate",
  "30",
  "-i",
  "artifacts/prototype-motion/%05d.jpg",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "artifacts/prototype-motion.mp4",
]);
