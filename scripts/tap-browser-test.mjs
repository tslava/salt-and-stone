import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const errors = [],
  checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const target = (id) => page.locator(`[data-hold="${id}"]`);
  const state = () =>
    page.evaluate(() => ({
      state: window.__game.game.state,
      selected: window.__game.game.selected,
      current: window.__game.game.current.id,
      moves: window.__game.game.moves,
      deaths: window.__game.game.deaths,
      camera: { ...window.__game.game.camera },
    }));
  await page.goto("http://localhost:5187/?debug=1");
  await page.locator("#start").tap();
  await target("a").tap();
  const selected = await state();
  await page.waitForTimeout(400);
  assert.equal((await state()).moves, 0);
  assert.deepEqual((await state()).camera, selected.camera);
  await target("b").tap();
  assert.equal((await state()).selected, "b");
  await page.locator("#clear-selection").tap();
  assert.equal((await state()).selected, null);
  await page.screenshot({ path: "artifacts/tap-controls-390.png" });
  checks.push(
    "tap only selects; immediate switching; clear selection; camera fixed",
  );
  if (!process.argv.includes("--layout")) {
    for (const id of [
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
    ]) {
      await page.waitForFunction(
        () =>
          !window.__game.game.current.rest || window.__game.game.energy >= 99,
      );
      await target(id).tap();
      assert.equal((await state()).selected, id);
      if (id === "c") {
        await page.screenshot({ path: "artifacts/tap-controls-selected.png" });
        await page.locator("#confirm-move").tap();
        assert.equal((await state()).state, "preparing");
        await page.locator("#clear-selection").tap();
        await page.waitForTimeout(800);
        assert.equal((await state()).current, "b");
        await target(id).tap();
        await page.locator("#pause").tap();
        await page.locator("#resume").tap();
        assert.equal((await state()).selected, null);
        await target(id).tap();
      }
      await page.locator("#confirm-move").tap();
      await page.waitForFunction(
        (id) => window.__game.game.current.id === id,
        id,
      );
    }
    await page.waitForFunction(() => window.__game.game.state === "complete");
    assert.equal((await state()).moves, 26);
    assert.equal((await state()).deaths, 0);
    checks.push(
      "complete route: 26 movements, 0 falls; automatic jump; cancel; pause",
    );
    await page.screenshot({ path: "artifacts/tap-controls-summit.png" });
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.reload();
  await page.locator("#start").tap();
  for (const id of ["a", "b", "c", "r1"]) {
    await target(id).tap();
    assert.equal((await state()).selected, id);
    await page.locator("#confirm-move").tap();
    await page.waitForFunction(
      (id) => window.__game.game.current.id === id,
      id,
    );
  }
  await target("d").tap();
  const boxes = await page.evaluate(() => {
    const panel = document.querySelector("#controls").getBoundingClientRect();
    return [...document.querySelectorAll(".hold-target")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.hold,
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        panelTop: panel.top,
      };
    });
  });
  for (const b of boxes) {
    assert.ok(b.x >= 24 && b.x <= 296, JSON.stringify(b));
    assert.ok(b.y >= 125 && b.y < b.panelTop - 12, JSON.stringify(b));
  }
  await page.screenshot({ path: "artifacts/tap-controls-320.png" });
  checks.push("320x568: first section via taps, targets above controls");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__game.game.selected === null);
  await target("d").tap();
  assert.equal((await state()).selected, "d");
  await page.locator("#confirm-move").tap();
  await page.waitForFunction(() => window.__game.game.current.id === "d");
  checks.push("landscape: target selection and confirmation after rotation");
  await page.screenshot({ path: "artifacts/tap-controls-landscape.png" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors }, null, 2));
  await writeFile(
    process.argv.includes("--layout")
      ? "artifacts/tap-layout-report.json"
      : "artifacts/tap-controls-report.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
