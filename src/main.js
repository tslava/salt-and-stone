import { Game } from "./engine.js";
import { Renderer } from "./render.js";
const $ = (id) => document.getElementById(id);
const game = new Game(),
  renderer = new Renderer($("scene"));
let last = performance.now(),
  toastTimer = 0,
  sound = false,
  audio = null;
const metrics = { frames: 0, renderMs: [], frameMs: [], errors: [] };
function tone(freq, duration = 0.12) {
  if (!sound) return;
  try {
    audio ||= new AudioContext();
    audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      freq * 0.7,
      audio.currentTime + duration,
    );
    g.gain.setValueAtTime(0.04, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + duration);
  } catch {
    sound = false;
  }
}
function toast(s) {
  $("toast").textContent = s;
  toastTimer = 4;
}
function showModal(kind = "pause") {
  const complete = kind === "complete";
  $("modal").hidden = false;
  $("modal-kicker").textContent = complete
    ? "ПОСЛЕДНИЙ СВЕТ · 02 / 02"
    : "ПЕРЕДЫШКА";
  $("modal-title").innerHTML = complete
    ? "Выше —<br>только небо."
    : "Море подождёт.";
  $("modal-text").textContent = complete
    ? `Обе скалы позади. ${game.moves} движений, ${game.jumpCount} прыжков. ${game.deaths === 0 ? "Без единого падения." : `Падений: ${game.deaths}.`} Побудь здесь немного.`
    : "Продолжи с того же движения или вернись на последний уступ.";
  $("resume").textContent = complete ? "Посмотреть на море" : "Продолжить ↗";
  $("restart").textContent = complete ? "Пройти заново" : "С последнего уступа";
}
$("start").onclick = () => {
  game.start();
  $("intro").hidden = true;
  $("hud").hidden = false;
  $("controls").hidden = false;
  $("feedback").hidden = false;
  $("pause").hidden = false;
  tone(300);
};
$("pause").onclick = () => {
  if (game.state === "complete") showModal("complete");
  else game.pause();
};
$("resume").onclick = () => {
  $("modal").hidden = true;
  if (game.state === "complete") {
    $("controls").hidden = true;
    $("feedback").hidden = true;
    toast("Вершина. Тишина. Море.");
  } else game.resume();
};
$("restart").onclick = () => {
  $("modal").hidden = true;
  if (game.state === "complete") {
    game.reset();
    $("controls").hidden = false;
    $("feedback").hidden = false;
  } else game.retry();
};
$("sound").onclick = () => {
  sound = !sound;
  $("sound").textContent = `Звук: ${sound ? "включён" : "выключен"}`;
  tone(480);
};
$("confirm-move").onclick = () => game.confirm();
$("clear-selection").onclick = () => game.cancel();
const targetButtons = new Map();
function updateTargets() {
  const visible =
    game.started &&
    !game.paused &&
    $("modal").hidden &&
    (game.state === "idle" || game.state === "preparing");
  $("targets").hidden = !visible;
  if (!visible) return;
  const targets = game.targets;
  for (const [id, button] of targetButtons) {
    if (!targets.some((h) => h.id === id)) {
      button.remove();
      targetButtons.delete(id);
    }
  }
  for (const h of targets) {
    let button = targetButtons.get(h.id);
    if (!button) {
      button = document.createElement("button");
      button.className = "hold-target";
      button.dataset.hold = h.id;
      button.innerHTML = '<span aria-hidden="true"></span>';
      button.onclick = () => game.select(h.id);
      $("targets").append(button);
      targetButtons.set(h.id, button);
    }
    const p = renderer.worldToScreen(h, game),
      plan = game.previewFor(h, Infinity);
    button.style.left = p.x + "px";
    button.style.top = p.y + "px";
    button.setAttribute("aria-pressed", String(game.selected === h.id));
    button.setAttribute(
      "aria-label",
      (h.label || "Зацеп " + h.id) +
        ": " +
        (plan.retreat
          ? "отход, резерв"
          : (plan.jump ? "прыжок" : "перехват") + ", " + plan.cost + " сил") +
        (plan.ready ? "" : ", не хватает сил"),
    );
    button.disabled = game.state !== "idle";
    button.dataset.affordable = String(plan.ready);
  }
}
window.addEventListener("blur", () => game.pause());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.pause();
});
window.addEventListener("pagehide", () => game.pause());
window.addEventListener("resize", () => {
  game.cancel();
  renderer.resize();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (game.selected) game.cancel();
    else game.pause();
  }
  if (e.key === " " && game.paused) {
    game.resume();
    $("modal").hidden = true;
  }
});
window.addEventListener("error", (e) => metrics.errors.push(e.message));
function ui(dt) {
  const finishing = ["mantle", "celebrate", "complete"].includes(game.state);
  $("controls").hidden = !game.started || finishing || game.paused;
  toastTimer -= dt;
  $("toast").style.opacity = toastTimer > 0 ? 1 : 0;
  $("chapter").textContent = game.started
    ? game.stage === 1
      ? "01 / 02 · ТЁПЛАЯ СТЕНА"
      : "02 / 02 · ВЕТРЯНАЯ ИГЛА"
    : "ВЕЧЕРНЕЕ ВОСХОЖДЕНИЕ";
  $("height").textContent = Math.round(18 + (game.current.y - 100) * 0.16);
  $("energy-number").textContent = Math.ceil(game.energy);
  $("energy-fill").style.width = `${game.energy}%`;
  $("energy-fill").style.background = game.energy < 25 ? "#e4937a" : "#f0cfab";
  $("energy-label").textContent =
    game.current.rest && game.state === "idle" ? "ОТДЫХ" : "СИЛЫ";
  const p = game.selectionPreview,
    preparing = game.state === "preparing";
  let title = "Коснись зацепа в кольце",
    detail = "Затем нажми кнопку движения",
    label = "Выбери зацеп";
  if (preparing) {
    title = "Готовимся к прыжку";
    detail = "Прыжок начнётся автоматически";
    label = "Подготовка…";
  } else if (p) {
    title = p.ready ? "Цель выбрана" : p.reason;
    detail = p.retreat
      ? "Назад к отдыху · основные силы не расходуются"
      : p.ready
        ? "Коснись другой опоры, чтобы изменить цель"
        : "Выбери опору назад — на отход есть резерв";
    label =
      (p.retreat
        ? p.jump
          ? "Прыжок назад"
          : "Отход"
        : p.jump
          ? "Прыжок"
          : "Перехват") +
      " · " +
      (p.retreat ? "резерв" : "−" + p.cost + " сил");
  } else if (game.state === "move") {
    title = game.move.jump ? "Прыжок" : "Перехват";
    detail = "Следующий зацеп — после приземления";
    label = "Движение…";
  } else if (game.state === "falling") {
    title = "Силы закончились";
    detail = "Возвращаемся на последний уступ";
    label = "Возвращаемся…";
  } else if (game.current.rest && game.energy < 99) {
    detail = "Силы восстанавливаются · можно выбирать дальше";
  }
  $("feedback").dataset.tone = p && !p.ready ? "warning" : "normal";
  $("action-title").textContent = title;
  $("action-detail").textContent = detail;
  $("confirm-move").textContent = label;
  $("confirm-move").disabled =
    !p?.ready || game.state !== "idle" || game.paused;
  $("clear-selection").disabled = !game.selected;
  $("clear-selection").textContent = preparing
    ? "Отменить прыжок"
    : "Снять выбор";
  $("charge-fill").parentElement.style.visibility = preparing
    ? "visible"
    : "hidden";
  $("charge-fill").style.width =
    (preparing
      ? Math.min(
          100,
          (game.preparation.elapsed / game.preparation.required) * 100,
        )
      : 0) + "%";
  $("energy-cost").style.left =
    (p ? Math.max(0, game.energy - p.cost) : 0) + "%";
  $("energy-cost").style.width = (p ? Math.min(game.energy, p.cost) : 0) + "%";
  updateTargets();
  for (const e of game.events.splice(0)) {
    if (e.type === "pause") showModal();

    if (e.type === "stage")
      toast(
        e.stage === 2 ? "02 / 02 · ВЕТРЯНАЯ ИГЛА" : "01 / 02 · ТЁПЛАЯ СТЕНА",
      );
    if (e.type === "complete") showModal("complete");
    if (e.type === "rejected") toast(e.reason);
    if (e.type === "fall") tone(95, 0.5);
    if (e.type === "catch") tone(240, 0.1);
    if (e.type === "move") tone(e.jump ? 410 : 320);
  }
}
function frame(now) {
  const delta = (now - last) / 1000;
  last = now;
  const t = performance.now();
  game.update(delta);
  renderer.draw(game);
  game.present();
  ui(Math.min(delta, 0.04));
  metrics.frames++;
  if (metrics.renderMs.length < 7200) {
    metrics.renderMs.push(performance.now() - t);
    metrics.frameMs.push(delta * 1000);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has("debug"))
  window.__game = { game, renderer, metrics };
