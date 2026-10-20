"use strict";

function initializeInvitationCover() {
  const cover = document.querySelector("#invitationCover");
  const stage = cover?.querySelector(".invitation-cover__stage");
  const leftPanel = cover?.querySelector(".invitation-cover__panel--left");
  const rightPanel = cover?.querySelector(".invitation-cover__panel--right");
  const openButton = cover?.querySelector("#openInvitation");
  const invitation = document.querySelector(".invitation");
  if (!cover || !stage || !leftPanel || !rightPanel || !openButton || !invitation) return;
  if (cover.dataset.coverInitialized === "true") return;

  cover.dataset.coverInitialized = "true";
  cover.dataset.state = "closed";

  const root = document.documentElement;
  const panels = [leftPanel, rightPanel];
  const backgroundNodes = Array.from(
    document.querySelectorAll(".invitation, #musicControls, #heartsToggle"),
  );
  const inertStates = backgroundNodes.map((element) => ({
    element,
    wasInert: Boolean(element.inert || element.hasAttribute("inert")),
  }));
  const rootWasLocked = root.classList.contains("has-invitation-cover");
  const reduceMotion = Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const transitionedPanels = new Set();
  let autoOpenTimer = null;
  let finishTimer = null;

  const setInert = (element, value) => {
    if ("inert" in element) element.inert = value;
    if (value) element.setAttribute("inert", "");
    else element.removeAttribute("inert");
  };

  const clearTimers = () => {
    window.clearTimeout(autoOpenTimer);
    window.clearTimeout(finishTimer);
    autoOpenTimer = null;
    finishTimer = null;
  };

  const removeOpenListeners = () => {
    openButton.removeEventListener("pointerup", beginOpening);
    openButton.removeEventListener("click", beginOpening);
    openButton.removeEventListener("keydown", handleOpenKeydown);
  };

  const removeTransitionListeners = () => {
    panels.forEach((panel) => panel.removeEventListener("transitionend", handlePanelTransition));
  };

  const restoreBackground = () => {
    inertStates.forEach(({ element, wasInert }) => setInert(element, wasInert));
    if (!rootWasLocked) root.classList.remove("has-invitation-cover");
  };

  const finishOpening = ({ restoreFocus = true } = {}) => {
    if (cover.dataset.state === "opened") return;

    const focusWasInsideCover = cover.contains(document.activeElement);
    clearTimers();
    removeOpenListeners();
    removeTransitionListeners();
    window.removeEventListener("pagehide", handlePageHide);
    cover.classList.remove("is-opening");
    cover.dataset.state = "opened";
    cover.hidden = true;
    restoreBackground();

    if (restoreFocus && focusWasInsideCover && !invitation.inert) {
      try {
        invitation.focus({ preventScroll: true });
      } catch {
        // Reading the invitation must not depend on programmatic focus support.
      }
    }
  };

  function handlePanelTransition(event) {
    if (event.propertyName !== "transform" || !panels.includes(event.target)) return;
    transitionedPanels.add(event.target);
    if (transitionedPanels.size === panels.length) finishOpening();
  }

  function handleOpenKeydown(event) {
    if (!["Escape", "Enter", " "].includes(event.key)) return;
    beginOpening();
  }

  function handlePageHide() {
    finishOpening({ restoreFocus: false });
  }

  function beginOpening() {
    if (cover.dataset.state !== "closed") return;

    cover.dataset.state = "opening";
    window.clearTimeout(autoOpenTimer);
    autoOpenTimer = null;
    removeOpenListeners();

    if (reduceMotion) {
      finishOpening();
      return;
    }

    panels.forEach((panel) => panel.addEventListener("transitionend", handlePanelTransition));
    cover.classList.add("is-opening");
    finishTimer = window.setTimeout(finishOpening, 1200);
  }

  inertStates.forEach(({ element }) => setInert(element, true));
  if (!rootWasLocked) root.classList.add("has-invitation-cover");
  cover.hidden = false;
  openButton.addEventListener("pointerup", beginOpening);
  openButton.addEventListener("click", beginOpening);
  openButton.addEventListener("keydown", handleOpenKeydown);
  window.addEventListener("pagehide", handlePageHide);

  try {
    openButton.focus({ preventScroll: true });
  } catch {
    // The timer and pointer interaction remain available when focus is unsupported.
  }

  autoOpenTimer = window.setTimeout(beginOpening, 5000);
}

initializeInvitationCover();
