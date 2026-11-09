import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { holds, holdById } from "../src/route.js";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await context.newCDPSession(page);
const wait = (ms) => page.waitForTimeout(ms);
const state = () =>
  page.evaluate(() => {
    const g = window.__game.game;
    return {
      current: g.current.id,
      state: g.state,
      energy: g.energy,
      moves: g.moves,
      paused: g.paused,
      stage: g.stage,
      deaths: g.deaths,
      history: g.history,
      gesture: g.gesture,
    };
  });
const touch = async (type, x = 180, y = 710) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints:
      type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y }],
  });
await page.goto("http://localhost:5187/?debug=1");
await page.getByRole("button", { name: "Начать восхождение" }).click();
await wait(1200);
// Sample the actual requestAnimationFrame loop, not a fast-forward model.
await page.evaluate(() => {
  window.motionAudit = {
    samples: 0,
    moving: 0,
    maxLimbError: 0,
    maxFrameDisplacement: 0,
    last: null,
  };
  function audit() {
    const g = window.__game.game,
      a = window.motionAudit;
    a.samples++;
    if (g.state === "move" || g.state === "mantle" || g.state === "celebrate") {
      a.moving++;
      for (const l of [...g.pose.arms, ...g.pose.legs])
        a.maxLimbError = Math.max(a.maxLimbError, l.error);
      if (a.last)
        a.maxFrameDisplacement = Math.max(
          a.maxFrameDisplacement,
          Math.hypot(g.pose.body.x - a.last.x, g.pose.body.y - a.last.y),
        );
    }
    a.last = { ...g.pose.body };
    if (a.samples < 12000) requestAnimationFrame(audit);
  }
  requestAnimationFrame(audit);
});
// Cancel, OS touch cancellation, second finger, focus interruption.
await touch("touchStart");
await touch("touchMove", 189, 663);
await touch("touchMove", 180, 710);
await wait(150);
await touch("touchEnd");
assert.equal((await state()).moves, 0);
await touch("touchStart");
await wait(180);
await touch("touchCancel");
assert.equal((await state()).gesture, null);
await touch("touchStart");
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [
    { x: 180, y: 710, id: 0 },
    { x: 220, y: 720, id: 1 },
  ],
});
await wait(100);
await touch("touchCancel");
assert.equal((await state()).moves, 0);
await touch("touchStart");
await wait(100);
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await touch("touchEnd");
await wait(80);
assert.equal((await state()).paused, true);
assert.equal((await state()).moves, 0);
await page.getByRole("button", { name: "Продолжить ↗" }).click();
const route = [
  "a",
  "b",
  "c",
  "r1",
  "d",
  "e",
  "r2",
  "f",
  "g",
  "h",
  "i",
  "r3",
  "j",
  "r4",
  "k",
  "l",
  "m",
  "r5",
  "n",
  "o",
  "r6",
  "p",
  "q",
  "r7",
  "v",
  "summit",
];
const previews = [];
let screenshotIndex = 0;
await mkdir("artifacts/playtest-motion", { recursive: true });
const frames = [];
let recording = false;
cdp.on("Page.screencastFrame", async (e) => {
  if (recording) {
    const n = frames.length;
    frames.push(
      writeFile(
        `artifacts/playtest-motion/${String(n).padStart(5, "0")}.jpg`,
        Buffer.from(e.data, "base64"),
      ),
    );
  }
  await cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId });
});
for (const id of route) {
  const st = await state(),
    from = holdById(st.current),
    to = holdById(id);
  if (from.rest && st.energy < 98)
    await wait(Math.ceil(((100 - st.energy) / 27) * 1000) + 100);
  if (id === "j") {
    recording = true;
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 80,
      maxWidth: 390,
      maxHeight: 844,
      everyNthFrame: 2,
    });
  }
  await touch("touchStart");
  await touch("touchMove", 180 + to.x - from.x, 710 - (to.y - from.y));
  await wait(750);
  const preview = (await state()).gesture?.preview;
  assert.equal(preview?.to, id, `selected target at ${from.id}`);
  assert.equal(preview.ready, true, JSON.stringify(preview));
  previews.push(preview);
  if (["b", "c", "r2", "h", "r4", "o", "r6", "summit"].includes(id)) {
    await page.screenshot({
      path: `artifacts/playtest-${String(++screenshotIndex).padStart(2, "0")}-${id}.png`,
    });
  }
  await touch("touchEnd");
  await wait(45);
  const moving = await state();
  assert.equal(moving.state, "move");
  assert.equal(moving.history.at(-1).committed, preview.to);
  if (id === "b") {
    // A touch started during a move must never become a buffered action.
    await touch("touchStart");
    await wait(720);
    await touch("touchEnd");
    await wait(100);
    assert.equal((await state()).current, "b");
  } else await wait(850);
  assert.equal((await state()).current, id);
  if (id === "r4") {
    await wait(400);
    await cdp.send("Page.stopScreencast");
    recording = false;
    await Promise.all(frames);
  }
}
await page.waitForFunction(() => window.__game.game.state === "complete", {
  timeout: 6000,
});
const complete = await state();
assert.equal(complete.state, "complete");
assert.equal(complete.stage, 2);
assert.equal(complete.deaths, 0);
assert.equal(complete.moves, 26);
await page.screenshot({ path: "artifacts/playtest-complete.png" });
await page.getByRole("button", { name: "Посмотреть на море" }).click();
await wait(500);
await page.screenshot({ path: "artifacts/playtest-summit.png" });
const audit = await page.evaluate(() => window.motionAudit);
assert.ok(audit.maxLimbError < 0.01);
assert.ok(audit.moving > 500);
assert.ok(audit.maxFrameDisplacement < 22, JSON.stringify(audit));
// Clean steady-state performance sample, after cold caches and outside screenshot recording.
await page.evaluate(() => {
  window.__game.metrics.renderMs.length = 0;
  window.__game.metrics.frameMs.length = 0;
});
await wait(10000);
const performanceReport = await page.evaluate(() => {
  const m = window.__game.metrics;
  const calc = (a) => {
    a = a.slice().sort((a, b) => a - b);
    return {
      samples: a.length,
      mean: a.reduce((s, v) => s + v, 0) / a.length,
      p50: a[Math.floor(a.length * 0.5)],
      p95: a[Math.floor(a.length * 0.95)],
      max: a.at(-1),
    };
  };
  return {
    render: calc(m.renderMs),
    frame: calc(m.frameMs),
    fps: 1000 / (m.frameMs.reduce((s, v) => s + v, 0) / m.frameMs.length),
  };
});
// Restart and actual exhaustion / automatic checkpoint recovery.
await page.getByRole("button", { name: "Пауза" }).click();
await page.getByRole("button", { name: "Пройти заново" }).click();
await wait(600);
await touch("touchStart");
await touch("touchMove", 189, 663);
await wait(130);
await touch("touchEnd");
await wait(850);
assert.equal((await state()).current, "a");
await page.evaluate(() => {
  window.__game.game.energy = 0.1;
  window.__game.game.idleTime = 5;
});
await wait(350);
assert.equal((await state()).state, "falling");
await page.screenshot({ path: "artifacts/playtest-fall.png" });
await wait(1100);
assert.equal((await state()).current, "s");
assert.equal((await state()).deaths, 1);
// Resize during an active gesture cancels rather than committing unseen input.
await touch("touchStart");
await wait(100);
await page.setViewportSize({ width: 320, height: 568 });
await touch("touchEnd");
await wait(500);
assert.equal((await state()).current, "s");
assert.equal((await state()).gesture, null);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
await page.screenshot({ path: "artifacts/playtest-320.png" });
await page.setViewportSize({ width: 844, height: 390 });
await wait(300);
await page.screenshot({ path: "artifacts/playtest-landscape.png" });
await page.setViewportSize({ width: 390, height: 844 });
await wait(300);
assert.equal(
  await page.evaluate(() => window.__game.renderer.canvas.width),
  780,
);
// Mode QA on both towers. These are visual fixtures, not gameplay completion evidence.
for (const mode of ["clay", "silhouette"]) {
  await page.goto(`http://localhost:5187/?debug=1&art=${mode}`);
  await page.getByRole("button", { name: "Начать восхождение" }).click();
  await page.evaluate(() => {
    const g = window.__game.game;
    g.camera = { x: 505, y: 855 };
    g.paused = true;
    document.getElementById("modal").hidden = true;
  });
  await wait(300);
  await page.screenshot({ path: `artifacts/playtest-second-${mode}.png` });
}
assert.deepEqual(errors, []);
const report = {
  environment: {
    browser: browser.version(),
    os: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
    viewport: "390×844 CSS px",
    dpr: 2,
    headless: true,
    device: "desktop mobile emulation; not a physical phone",
  },
  checks: [
    "real touch route completion",
    "preview equals committed action",
    "cancel by return to origin",
    "OS touch cancel",
    "second finger",
    "blur",
    "ignored input during movement",
    "death and checkpoint respawn",
    "restart",
    "resize during aim",
    "320×568",
    "844×390",
    "gray and silhouette modes",
  ],
  completion: {
    moves: complete.moves,
    deaths: complete.deaths,
    stage: complete.stage,
  },
  audit,
  performance: performanceReport,
  errors,
};
await writeFile(
  "artifacts/browser-report.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (frames.length)
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    "30",
    "-i",
    "artifacts/playtest-motion/%05d.jpg",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "artifacts/playtest-motion.mp4",
  ]);
