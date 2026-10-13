"use strict";

(() => {
  const layer = document.querySelector("#fallingHearts");
  const toggle = document.querySelector("#heartsToggle");
  if (!layer || !toggle) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let enabled = true;
  let pageActive = true;

  // A fixed pool keeps DOM size and work bounded, even on a long-open invitation.
  const createHearts = () => {
    if (layer.childElementCount) return;
    const fragments = document.createDocumentFragment();
    for (let index = 0; index < 8; index += 1) {
      const heart = document.createElement("span");
      heart.className = "heart-particle";
      heart.style.setProperty("--heart-x", `${5 + index * 12.5 + Math.random() * 2}%`);
      heart.style.setProperty("--heart-size", `${12 + Math.random() * 6}px`);
      heart.style.setProperty("--heart-duration", `${10 + Math.random() * 6}s`);
      heart.style.setProperty("--heart-delay", `${-index * 1.8}s`);
      heart.style.setProperty("--heart-drift", `${Math.random() * 32 - 16}px`);
      heart.style.setProperty("--heart-rotation", `${Math.random() * 48 - 24}deg`);
      heart.style.setProperty("--heart-opacity", `${0.55 + Math.random() * 0.25}`);
      fragments.append(heart);
    }
    layer.append(fragments);
  };

  const sync = () => {
    const mayAnimate = enabled && !reducedMotion.matches;
    toggle.hidden = reducedMotion.matches;
    toggle.setAttribute("aria-pressed", String(mayAnimate));
    const label = mayAnimate ? "Tắt hiệu ứng trái tim" : "Bật hiệu ứng trái tim";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    layer.hidden = !mayAnimate;
    layer.dataset.paused = String(document.hidden || !pageActive || !mayAnimate);
    if (mayAnimate) createHearts();
    else layer.replaceChildren();
  };

  toggle.addEventListener("click", () => {
    enabled = !enabled;
    sync();
  });
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pagehide", () => {
    pageActive = false;
    sync();
  });
  window.addEventListener("pageshow", () => {
    pageActive = true;
    sync();
  });
  reducedMotion.addEventListener("change", sync);
  sync();
})();
