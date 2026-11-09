import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await page.goto("http://localhost:5187/?debug=1");
  await page.getByRole("button", { name: "Начать восхождение" }).click();
  await page.waitForTimeout(1000);
  const send = (type, x = 180, y = 710) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y }],
    });
  const read = () =>
    page.evaluate(() => ({
      id: window.__game.game.current.id,
      preview: window.__game.game.gesture?.preview,
      state: window.__game.game.state,
      energy: window.__game.game.energy,
      retreat: window.__game.game.retreatTarget?.id,
    }));
  await page.screenshot({ path: "artifacts/refinement-rest.png" });
  const box = await page.locator("#feedback").boundingBox();
  assert.ok(box.y + box.height < 300);
  assert.ok(box.y > 140);
  await send("touchStart");
  await send("touchMove", 189, 663);
  for (let i = 0; i < 12; i++) {
    await send("touchMove", i % 2 ? 225 : 189, i % 2 ? 655 : 663);
    await page.waitForTimeout(25);
    assert.equal((await read()).preview.to, "a");
  }
  await page.screenshot({ path: "artifacts/refinement-magnet.png" });
  await send("touchEnd");
  await page.waitForTimeout(800);
  assert.equal((await read()).id, "a");
  for (const [id, dx, dy] of [
    ["b", 48, 20],
    ["c", 97, 56],
  ]) {
    await send("touchStart");
    await send("touchMove", 180 + dx, 710 - dy);
    await page.waitForTimeout(id === "c" ? 180 : 450);
    if (id === "c") {
      assert.equal((await read()).preview.reason, "Готовь прыжок");
      await page.screenshot({ path: "artifacts/refinement-charge.png" });
      await page.waitForTimeout(550);
    }
    assert.equal((await read()).preview.to, id);
    await send("touchEnd");
    await page.waitForTimeout(900);
    assert.equal((await read()).id, id);
  }
  await page.evaluate(() => {
    window.__game.game.energy = 0.01;
    window.__game.game.idleTime = 0;
  });
  for (const [id, dx, dy] of [
    ["b", -97, -56],
    ["a", -48, -20],
    ["s", -9, -47],
  ]) {
    await send("touchStart");
    await send("touchMove", 180 + dx, 710 - dy);
    await page.waitForTimeout(700);
    const s = await read();
    assert.equal(s.preview.to, id);
    assert.equal(s.preview.retreat, true);
    assert.equal(s.preview.cost, 0);
    assert.ok(s.preview.ready);
    if (id === "b")
      await page.screenshot({ path: "artifacts/refinement-retreat.png" });
    await send("touchEnd");
    await page.waitForTimeout(900);
    assert.equal((await read()).id, id);
  }
  assert.equal(await page.evaluate(() => window.__game.game.deaths), 0);
  await page.waitForTimeout(1000);
  assert.ok((await read()).energy > 20);
  await send("touchStart");
  await send("touchMove", 189, 663);
  await page.waitForTimeout(200);
  await send("touchMove", 184, 713);
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => window.__game.game.gesture.cancelled),
    true,
  );
  await page.screenshot({ path: "artifacts/refinement-cancel.png" });
  await send("touchEnd");
  assert.equal((await read()).id, "s");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(300);
  const narrow = await page.locator("#feedback").boundingBox();
  assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 320);
  assert.ok(narrow.y + narrow.height < 255);
  await page.screenshot({ path: "artifacts/refinement-320.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { holdById } = await import("/src/route.js");
    const { poseAt } = await import("/src/rig.js");
    const g = window.__game.game;
    g.current = holdById("summit");
    g.state = "mantle";
    g.mantleTime = 0;
    g.camera = { x: 505, y: 1130 };
    g.stage = 2;
    g.pose = poseAt(g.current);
    window.victorySamples = [];
    function sample() {
      window.victorySamples.push({
        state: g.state,
        hands: g.pose.hands,
        feet: g.pose.feet,
      });
      if (g.state !== "complete") requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(2100);
  assert.equal((await read()).state, "celebrate");
  await page.screenshot({ path: "artifacts/refinement-victory-motion.png" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "artifacts/refinement-victory-raised.png" });
  await page.waitForTimeout(800);
  assert.equal((await read()).state, "complete");
  await page.getByRole("button", { name: "Посмотреть на море" }).click();
  await page.screenshot({ path: "artifacts/refinement-victory.png" });
  const victory = await page.evaluate(() => ({
    frames: window.victorySamples.filter((s) => s.state === "celebrate").length,
    raised: window.__game.game.pose.hands.every(
      (h) => h.y > window.__game.game.pose.head.y + 15,
    ),
  }));
  assert.ok(victory.frames > 70);
  assert.ok(victory.raised);
  assert.deepEqual(errors, []);
  const report = {
    checks: [
      "top status panel",
      "touch jitter magnet",
      "jump preparation readable",
      "zero-energy return via reverse jump and downclimbs",
      "touch-origin cancellation",
      "320 px panel",
      "real-time victory animation",
    ],
    retreat: {
      from: "c",
      via: ["b", "a"],
      rest: "s",
      initialEnergy: 0.01,
      deaths: 0,
    },
    victory,
    errors,
  };
  await writeFile(
    "artifacts/refinement-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
