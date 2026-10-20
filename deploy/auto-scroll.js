"use strict";

const AUTO_SCROLL_SPEED = 20;
const AUTO_SCROLL_START_DELAY = 1200;
const AUTO_SCROLL_MAX_FRAME_DELTA = 64;
const AUTO_SCROLL_DIVERGENCE_TOLERANCE = 2;

function initializeAutoScroll() {
  const invitation = document.querySelector(".invitation");
  if (!invitation) return;
  if (invitation.dataset.autoScrollInitialized === "true") return;
  invitation.dataset.autoScrollInitialized = "true";

  const root = document.documentElement;
  const cover = document.querySelector("#invitationCover");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)") || { matches: false };
  const rootHadAutoClass = root.classList.contains("is-auto-scrolling");
  let state = "idle";
  let automaticDisabled = Boolean(reducedMotion.matches);
  let domReady = document.readyState === "complete";
  let delayTimer = null;
  let frameId = null;
  let lastFrameTime = null;
  let targetScrollY = Number(window.scrollY || 0);
  let expectedScrollY = targetScrollY;
  let coverObserver = null;

  const setState = (nextState) => {
    state = nextState;
    invitation.dataset.autoScrollState = state;
  };

  const addAutoScrollClass = () => {
    if (!rootHadAutoClass) root.classList.add("is-auto-scrolling");
  };

  const removeAutoScrollClass = () => {
    if (!rootHadAutoClass) root.classList.remove("is-auto-scrolling");
  };

  const clearDelay = () => {
    window.clearTimeout(delayTimer);
    delayTimer = null;
  };

  const clearFrame = () => {
    window.cancelAnimationFrame(frameId);
    frameId = null;
    lastFrameTime = null;
  };

  const currentScrollY = () => Number(window.scrollY || 0);

  const maximumScrollY = () => {
    const documentHeight = Math.max(
      Number(document.documentElement.scrollHeight || 0),
      Number(document.body?.scrollHeight || 0),
    );
    return Math.max(0, documentHeight - Number(window.innerHeight || 0));
  };

  const mainIsInert = () => Boolean(invitation.inert || invitation.hasAttribute("inert"));

  const pageIsBlocked = () => Boolean(
    document.hidden
    || mainIsInert()
    || root.classList.contains("has-invitation-cover")
    || document.querySelector("dialog[open]"),
  );

  const cancelMotion = () => {
    clearDelay();
    clearFrame();
    removeAutoScrollClass();
  };

  const pausePermanently = () => {
    automaticDisabled = true;
    cancelMotion();
    if (state !== "finished") setState("paused");
    coverObserver?.disconnect();
  };

  const finishAtBottom = () => {
    automaticDisabled = true;
    cancelMotion();
    setState("finished");
    coverObserver?.disconnect();
  };

  const runFrame = (timestamp) => {
    frameId = null;
    if (state !== "running") return;
    if (pageIsBlocked()) {
      pausePermanently();
      return;
    }

    const maxScrollY = maximumScrollY();
    if (maxScrollY <= currentScrollY() + 0.5 || targetScrollY >= maxScrollY) {
      finishAtBottom();
      return;
    }

    if (lastFrameTime === null) {
      lastFrameTime = timestamp;
      frameId = window.requestAnimationFrame(runFrame);
      return;
    }

    const elapsed = Math.min(
      AUTO_SCROLL_MAX_FRAME_DELTA,
      Math.max(0, Number(timestamp) - Number(lastFrameTime)),
    );
    lastFrameTime = timestamp;
    targetScrollY = Math.min(
      maxScrollY,
      targetScrollY + (AUTO_SCROLL_SPEED * elapsed) / 1000,
    );
    expectedScrollY = targetScrollY;
    window.scrollTo({
      top: targetScrollY,
      left: Number(window.scrollX || 0),
      behavior: "auto",
    });

    if (targetScrollY >= maxScrollY || currentScrollY() >= maxScrollY - 0.5) {
      finishAtBottom();
      return;
    }
    frameId = window.requestAnimationFrame(runFrame);
  };

  const startRunning = () => {
    clearDelay();
    clearFrame();
    if (automaticDisabled || state !== "waiting") return;
    if (pageIsBlocked()) {
      pausePermanently();
      return;
    }
    if (reducedMotion.matches) {
      pausePermanently();
      return;
    }

    const maxScrollY = maximumScrollY();
    const scrollY = currentScrollY();
    if (maxScrollY <= scrollY + 0.5) {
      finishAtBottom();
      return;
    }

    targetScrollY = scrollY;
    expectedScrollY = scrollY;
    lastFrameTime = null;
    coverObserver?.disconnect();
    addAutoScrollClass();
    setState("running");
    frameId = window.requestAnimationFrame(runFrame);
  };

  const scheduleAutomaticStart = () => {
    if (automaticDisabled || state !== "idle") return;
    targetScrollY = currentScrollY();
    expectedScrollY = targetScrollY;
    setState("waiting");
    delayTimer = window.setTimeout(() => {
      delayTimer = null;
      if (state !== "waiting") return;
      startRunning();
    }, AUTO_SCROLL_START_DELAY);
  };

  const focusIsNeutral = () => {
    const active = document.activeElement;
    return !active
      || active === document.body
      || active === root
      || active === invitation
      || Boolean(cover?.contains(active));
  };

  const userIsAlreadyReading = () => Boolean(
    currentScrollY() > AUTO_SCROLL_DIVERGENCE_TOLERANCE
    || window.location?.hash
    || !focusIsNeutral(),
  );

  const coverGateIsOpen = () => Boolean(
    cover
    && cover.hidden
    && cover.dataset.state === "opened"
    && !mainIsInert()
    && !root.classList.contains("has-invitation-cover"),
  );

  const evaluateAutomaticGate = () => {
    if (
      !domReady
      || automaticDisabled
      || state !== "idle"
      || !coverGateIsOpen()
      || pageIsBlocked()
    ) return;
    if (userIsAlreadyReading()) {
      pausePermanently();
      return;
    }
    scheduleAutomaticStart();
  };

  const handleGateMutation = () => {
    if (
      document.querySelector("dialog[open]")
      || ((state === "waiting" || state === "running") && pageIsBlocked())
    ) {
      pausePermanently();
      return;
    }
    evaluateAutomaticGate();
  };

  const eventPathContains = (event, element) => {
    if (!element) return false;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(element) || (event.target instanceof Node && element.contains(event.target));
  };

  const isInteractiveTarget = (target) => target instanceof Element
    && Boolean(target.closest("a[href], button, input, textarea, select, [contenteditable]:not([contenteditable='false'])"));

  const handleUserInput = (event) => {
    if (!event.isTrusted || eventPathContains(event, cover)) return;
    if (event.type === "focusin" && !isInteractiveTarget(event.target)) return;
    if (
      event.type === "keydown"
      && (event.isComposing || ["Shift", "Control", "Alt", "Meta"].includes(event.key))
    ) return;
    pausePermanently();
  };

  const userEvents = ["pointerdown", "touchstart", "wheel", "click", "keydown", "focusin"];
  userEvents.forEach((eventName) => {
    document.addEventListener(eventName, handleUserInput, { capture: true, passive: true });
  });

  window.addEventListener("scroll", () => {
    if (
      (state === "waiting" || state === "running")
      && Math.abs(currentScrollY() - expectedScrollY) > AUTO_SCROLL_DIVERGENCE_TOLERANCE
    ) pausePermanently();
  });

  const handleReducedMotionChange = (event) => {
    if (!event.matches) return;
    pausePermanently();
  };
  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", handleReducedMotionChange);
  } else if (typeof reducedMotion.addListener === "function") {
    reducedMotion.addListener(handleReducedMotionChange);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pausePermanently();
  });
  window.addEventListener("pagehide", pausePermanently);

  if (!domReady) {
    document.addEventListener("DOMContentLoaded", () => {
      domReady = true;
      evaluateAutomaticGate();
    }, { once: true });
  }

  if (cover && typeof MutationObserver === "function") {
    coverObserver = new MutationObserver(handleGateMutation);
    coverObserver.observe(cover, {
      attributes: true,
      attributeFilter: ["data-state", "hidden"],
    });
    coverObserver.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });
    coverObserver.observe(invitation, {
      attributes: true,
      attributeFilter: ["inert"],
    });
    if (document.body) {
      coverObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["open"],
        subtree: true,
      });
    }
  }

  setState("idle");
  if (document.hidden || reducedMotion.matches || document.querySelector("dialog[open]")) {
    pausePermanently();
  }
  else evaluateAutomaticGate();
}

initializeAutoScroll();
