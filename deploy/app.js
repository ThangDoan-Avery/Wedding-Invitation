"use strict";

const WEDDING = {
  groom: "Hữu Thắng",
  bride: "Thu Trang",
  date: {
    year: 2026,
    month: 11,
    day: 15,
  },
  countdownTargetISO: "2026-11-15T09:00:00+07:00",
  events: {
    Th: {
      title: "Tiệc cưới Hữu Thắng & Thu Trang - Nhà trai",
      startUtc: "20261115T020000Z",
      endUtc: "20261115T050000Z",
      location: "Tư gia nhà trai, thôn 3 An Quý, xã Vĩnh Hải, thành phố Hải Phòng",
    },
    Tr: {
      title: "Tiệc cưới Hữu Thắng & Thu Trang - Nhà gái",
      startUtc: "20261115T020000Z",
      endUtc: "20261115T050000Z",
      location: "Thôn Ấp Giáo, xã Vĩnh Hải, thành phố Hải Phòng",
    },
  },
};

const ALBUM_PHOTOS = Array.isArray(globalThis.INVITATION_ALBUM_PHOTOS)
  ? globalThis.INVITATION_ALBUM_PHOTOS
    .filter((photo) => (
      photo
      && typeof photo === "object"
      && !Array.isArray(photo)
      && typeof photo.src === "string"
      && photo.src.trim()
    ))
    .map((photo, index) => ({
      src: photo.src.trim(),
      alt: typeof photo.alt === "string" && photo.alt.trim()
        ? photo.alt.trim()
        : `Ảnh cưới Hữu Thắng và Thu Trang ${index + 1}`,
      position: typeof photo.position === "string" && photo.position.trim()
        ? photo.position.trim()
        : "50% 50%",
    }))
  : [];

const DEFAULT_GUEST = "Quý khách";
const SUPABASE_URL = "https://fqafkaihbwgjqcabvisg.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_COjqwVjlb0fTmkkAxQ7PbA_SQqdcm5K";
const WISH_TABLE = "wedding_wishes";
const RSVP_TABLE = "wedding_rsvps";
const LOCAL_WISHES_KEY = "wedding-wishes-v2";
const LOCAL_RSVPS_KEY = "wedding-rsvps-v2";
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu;
const COUNTDOWN_UNITS = ["days", "hours", "minutes", "seconds"];
const RSVP_GUEST_COUNTS = new Set(Array.from({ length: 10 }, (_, index) => String(index + 1)));
const MUSIC_TRACK_LABEL = "Ánh Nắng Của Anh – Đức Phúc";

let supabaseClient;

function select(selector, root = document) {
  return root.querySelector(selector);
}

function selectAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function normalizeText(value, maxLength) {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return Array.from(normalized).slice(0, maxLength).join("");
}

function readGuestParam(search = window.location.search, pathname = window.location.pathname) {
  const fallback = { displayName: DEFAULT_GUEST, supplied: false };

  try {
    let encodedGuest = null;
    if (pathname.startsWith("/guest=")) {
      // A trailing slash is optional; a path name takes precedence over the old query format.
      const match = pathname.match(/^\/guest=([^/]*)\/?$/u);
      if (!match) return fallback;
      encodedGuest = match[1];
    } else {
      // Keep old ?guest= links, including encoded keys, and decode the value strictly once.
      const entry = search.replace(/^\?/u, "").split("&")
        .find((part) => new URLSearchParams(part).has("guest"));
      if (entry !== undefined) {
        const separator = entry.indexOf("=");
        encodedGuest = separator === -1 ? "" : entry.slice(separator + 1);
      }
    }

    if (encodedGuest === null) return fallback;

    // Convert literal + before decoding so an encoded plus (%2B) remains part of the name.
    const rawGuest = decodeURIComponent(encodedGuest.replace(/\+/gu, " "));
    if (rawGuest.includes("\uFFFD")) return fallback;

    const normalized = normalizeText(rawGuest, 80);
    const displayName = normalizeText(
      normalized.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("vi-VN")),
      80,
    );
    return displayName ? { displayName, supplied: true } : fallback;
  } catch {
    return fallback;
  }
}

function applyGuestName(guest) {
  selectAll("[data-guest-name]").forEach((element) => {
    element.textContent = guest.displayName;
  });

  if (!guest.supplied) return;

  const rsvpName = select("#rsvpName");
  const wishName = select("#guestName");
  if (rsvpName) rsvpName.value = guest.displayName;
  if (wishName) wishName.value = guest.displayName;
}

function calculateCountdown(targetTime, nowTime = Date.now()) {
  const remainingMilliseconds = Math.max(0, targetTime - nowTime);
  const totalSeconds = Math.ceil(remainingMilliseconds / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    remainingMilliseconds,
    expired: remainingMilliseconds <= 0,
  };
}

function setupCountdown() {
  const countdown = select("#weddingCountdown");
  if (!countdown) return;

  const targetTime = Date.parse(WEDDING.countdownTargetISO);
  if (!Number.isFinite(targetTime)) {
    console.warn("Mốc thời gian đếm ngược không hợp lệ.");
    return;
  }

  const values = new Map(
    COUNTDOWN_UNITS.map((unit) => [
      unit,
      select(`strong[data-countdown-unit="${unit}"], [data-countdown-unit="${unit}"] strong`, countdown),
    ]),
  );
  if (![...values.values()].some(Boolean)) return;

  const status = select("#countdownStatus");
  let timerId = null;
  let hasReachedDeadline = false;

  countdown.setAttribute("aria-live", "off");

  const stop = () => {
    if (timerId === null) return;
    window.clearTimeout(timerId);
    timerId = null;
  };

  const render = () => {
    const parts = calculateCountdown(targetTime);

    COUNTDOWN_UNITS.forEach((unit) => {
      const element = values.get(unit);
      if (element) element.textContent = String(parts[unit]).padStart(2, "0");
    });

    if (parts.expired && !hasReachedDeadline) {
      hasReachedDeadline = true;
      if (status) status.textContent = "Đã đến ngày vui của Hữu Thắng và Thu Trang.";
    }

    return parts.remainingMilliseconds;
  };

  const schedule = () => {
    stop();
    const remainingMilliseconds = render();
    if (remainingMilliseconds <= 0 || document.hidden) return;

    timerId = window.setTimeout(schedule, Math.min(1000, remainingMilliseconds));
  };

  const resync = () => {
    if (document.hidden) {
      stop();
      render();
      return;
    }
    schedule();
  };

  document.addEventListener("visibilitychange", resync);
  window.addEventListener("pageshow", resync);
  window.addEventListener("pagehide", stop);
  resync();
}

function fillCalendar() {
  const calendar = select("#calendar");
  if (!calendar) return;

  const weekdayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const monthIndex = WEDDING.date.month - 1;
  const firstWeekday = (new Date(WEDDING.date.year, monthIndex, 1).getDay() + 6) % 7;
  const totalDays = new Date(WEDDING.date.year, monthIndex + 1, 0).getDate();
  const weddingDate = new Date(WEDDING.date.year, monthIndex, WEDDING.date.day);
  const selectedLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(weddingDate);

  const week = document.createElement("div");
  week.className = "calendar__week";
  weekdayNames.forEach((weekday) => {
    const label = document.createElement("span");
    label.textContent = weekday;
    week.append(label);
  });

  const days = document.createElement("div");
  days.className = "calendar__days";

  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement("span");
    blank.setAttribute("aria-hidden", "true");
    days.append(blank);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const cell = document.createElement("span");
    cell.textContent = String(day);
    if (day === WEDDING.date.day) {
      cell.className = "is-selected";
      cell.setAttribute("aria-label", `Ngày cưới, ${selectedLabel}`);
    }
    days.append(cell);
  }

  calendar.replaceChildren(week, days);
}

function buildCalendarUrl(event) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("dates", `${event.startUtc}/${event.endUtc}`);
  url.searchParams.set(
    "details",
    `Trân trọng kính mời bạn đến chung vui trong ngày cưới của ${WEDDING.groom} và ${WEDDING.bride}.`,
  );
  url.searchParams.set("location", event.location);
  return url.toString();
}

function setupCalendarLinks() {
  selectAll("[data-calendar-side]").forEach((link) => {
    const event = WEDDING.events[link.dataset.calendarSide];
    if (event) link.href = buildCalendarUrl(event);
  });
}

function getSupabaseClient() {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_PUBLIC_KEY) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  }
  return supabaseClient;
}

function setFormStatus(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function readLocalArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}

function writeLocalArray(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function formatWishDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function createWishNode(wish) {
  const safeWish = wish && typeof wish === "object" ? wish : {};
  const article = document.createElement("article");
  article.className = "wish-item";

  const name = document.createElement("strong");
  name.textContent = normalizeText(safeWish.name, 80) || "Khách mời";

  const time = document.createElement("time");
  time.dateTime = String(safeWish.created_at || "");
  time.textContent = formatWishDate(safeWish.created_at);

  const message = document.createElement("p");
  message.textContent = normalizeText(safeWish.message, 500);

  article.append(name, time, message);
  return article;
}

function renderWishes(list, wishes) {
  if (!list) return;

  if (!wishes.length) {
    const empty = document.createElement("p");
    empty.className = "wish-empty";
    empty.textContent = "Hãy là người đầu tiên gửi lời chúc đến cô dâu chú rể.";
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(...wishes.map(createWishNode));
}

function setupWishes() {
  const form = select("#wishForm");
  const list = select("#wishList");
  const status = select("#wishStatus");
  const submitButton = form?.querySelector('button[type="submit"]');
  if (!form || !list || !submitButton) return;

  const db = getSupabaseClient();
  let wishes = readLocalArray(LOCAL_WISHES_KEY);
  renderWishes(list, wishes);

  const loadRemoteWishes = async () => {
    if (!db) return false;

    const { data, error } = await db
      .from(WISH_TABLE)
      .select("name,message,created_at")
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.warn("Không thể tải sổ lưu bút:", error.message);
      return false;
    }

    wishes = Array.isArray(data) ? data : [];
    renderWishes(list, wishes);
    return true;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nameInput = select("#guestName");
    const wishInput = select("#guestWish");
    const name = normalizeText(nameInput?.value, 80);
    const message = normalizeText(wishInput?.value, 500);

    if (!name || !message) {
      setFormStatus(status, "Vui lòng nhập đầy đủ tên và lời chúc.", true);
      return;
    }

    submitButton.disabled = true;
    setFormStatus(status, "Đang gửi lời chúc...");

    try {
      if (db) {
        const { error } = await db.from(WISH_TABLE).insert({ name, message });
        if (error) throw error;

        await loadRemoteWishes();
        setFormStatus(status, "Lời chúc của bạn đã được gửi. Cảm ơn bạn!");
      } else {
        const localWish = { name, message, created_at: new Date().toISOString() };
        wishes = [localWish, ...wishes].slice(0, 20);
        writeLocalArray(LOCAL_WISHES_KEY, wishes);
        renderWishes(list, wishes);
        setFormStatus(status, "Đã lưu lời chúc trên thiết bị này. Kết nối mạng để chia sẻ với mọi người.");
      }

      if (wishInput) wishInput.value = "";
    } catch (error) {
      console.warn("Không thể gửi lời chúc:", error?.message || error);
      setFormStatus(status, "Chưa gửi được lời chúc. Vui lòng thử lại sau.", true);
    } finally {
      submitButton.disabled = false;
    }
  });

  void loadRemoteWishes().catch((error) => {
    console.warn("Không thể tải sổ lưu bút:", error?.message || error);
  });
}

function setupRsvp() {
  const form = select("#rsvpForm");
  const status = select("#rsvpStatus");
  const submitButton = form?.querySelector('button[type="submit"]');
  const guestCountSelect = select("#rsvpGuestCount");
  if (!form || !submitButton) return;

  if (!guestCountSelect) {
    console.warn("Không tìm thấy trường số lượng người tham dự.");
    setFormStatus(status, "Chưa thể gửi xác nhận. Vui lòng thử lại sau.", true);
    submitButton.disabled = true;
    return;
  }

  const db = getSupabaseClient();
  const attendanceInputs = selectAll('input[name="attendance"]', form);

  const syncGuestCountState = () => {
    const isAttending = form.elements.namedItem("attendance")?.value === "yes";
    guestCountSelect.disabled = !isAttending;
    guestCountSelect.required = isAttending;
  };

  attendanceInputs.forEach((input) => input.addEventListener("change", syncGuestCountState));
  syncGuestCountState();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = normalizeText(select("#rsvpName")?.value, 80);
    const attendance = form.elements.namedItem("attendance")?.value;
    const attending = attendance === "yes";
    const selectedGuestCount = Number.parseInt(guestCountSelect.value, 10);
    const guestCount = attending ? selectedGuestCount : 0;
    const hasValidGuestCount = !attending || RSVP_GUEST_COUNTS.has(guestCountSelect.value);

    if (
      !name
      || !["yes", "no"].includes(attendance)
      || !hasValidGuestCount
    ) {
      setFormStatus(status, "Vui lòng kiểm tra lại thông tin xác nhận.", true);
      return;
    }

    const payload = {
      name,
      attendance,
      attending,
      invitation_side: null,
      guest_count: guestCount,
      created_at: new Date().toISOString(),
    };

    submitButton.disabled = true;
    setFormStatus(status, "Đang gửi xác nhận...");

    try {
      if (db) {
        const { error } = await db.from(RSVP_TABLE).insert({
          name: payload.name,
          attendance: payload.attendance,
          attending: payload.attending,
          invitation_side: payload.invitation_side,
          guest_count: payload.guest_count,
        });
        if (error) throw error;
        setFormStatus(status, "Cảm ơn bạn. Xác nhận của bạn đã được ghi nhận!");
      } else {
        const localRsvps = readLocalArray(LOCAL_RSVPS_KEY);
        writeLocalArray(LOCAL_RSVPS_KEY, [payload, ...localRsvps].slice(0, 30));
        setFormStatus(status, "Đã lưu xác nhận trên thiết bị này. Kết nối mạng để gửi đến gia đình.");
      }
    } catch (error) {
      console.warn("Không thể gửi xác nhận:", error?.message || error);
      setFormStatus(status, "Chưa gửi được xác nhận. Vui lòng thử lại sau.", true);
    } finally {
      submitButton.disabled = false;
    }
  });
}

function setupAlbum() {
  const album = select("[data-album]");
  const viewer = select("#albumViewer");
  const emptyState = select("#albumEmpty");
  const mainImage = select("#albumImage");
  const previousButton = select("#albumPrev");
  const nextButton = select("#albumNext");
  const counter = select("#albumCounter");
  const thumbContainer = select("#albumThumbs");
  if (
    !album
    || !viewer
    || !emptyState
    || !mainImage
    || !previousButton
    || !nextButton
    || !counter
    || !thumbContainer
  ) return;

  thumbContainer.replaceChildren();
  previousButton.disabled = ALBUM_PHOTOS.length <= 1;
  nextButton.disabled = ALBUM_PHOTOS.length <= 1;

  if (!ALBUM_PHOTOS.length) {
    viewer.hidden = true;
    emptyState.hidden = false;
    counter.textContent = "";
    return;
  }

  viewer.hidden = false;
  emptyState.hidden = true;

  const thumbs = ALBUM_PHOTOS.map((photo, index) => {
    const button = document.createElement("button");
    const image = document.createElement("img");
    button.type = "button";
    button.dataset.albumIndex = String(index);
    button.setAttribute("aria-label", `Xem ảnh ${index + 1}`);
    image.src = photo.src;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.style.objectPosition = photo.position;
    button.append(image);
    thumbContainer.append(button);
    return button;
  });

  let activeIndex = 0;

  const render = () => {
    const photo = ALBUM_PHOTOS[activeIndex];
    mainImage.src = photo.src;
    mainImage.alt = photo.alt;
    mainImage.style.objectPosition = photo.position;
    counter.textContent = `${activeIndex + 1} / ${ALBUM_PHOTOS.length}`;

    thumbs.forEach((button, index) => {
      const isActive = index === activeIndex;
      button.setAttribute("aria-current", isActive ? "true" : "false");
    });
  };

  const scrollActiveThumbIntoView = () => {
    const activeThumb = thumbs[activeIndex];
    if (!activeThumb || typeof thumbContainer.scrollTo !== "function") return;
    const containerRect = thumbContainer.getBoundingClientRect();
    const thumbRect = activeThumb.getBoundingClientRect();
    const left = Math.max(
      0,
      Number(thumbContainer.scrollLeft || 0)
        + Number(thumbRect.left || 0)
        - Number(containerRect.left || 0)
        - (Number(containerRect.width || 0) - Number(thumbRect.width || 0)) / 2,
    );
    thumbContainer.scrollTo({ left, behavior: "auto" });
  };

  const show = (index, { scrollThumb = false } = {}) => {
    const requestedIndex = Number(index);
    if (!Number.isInteger(requestedIndex)) return;
    activeIndex = (
      (Math.trunc(requestedIndex) % ALBUM_PHOTOS.length) + ALBUM_PHOTOS.length
    ) % ALBUM_PHOTOS.length;
    render();
    if (scrollThumb) scrollActiveThumbIntoView();
  };

  previousButton.addEventListener("click", () => show(activeIndex - 1, { scrollThumb: true }));
  nextButton.addEventListener("click", () => show(activeIndex + 1, { scrollThumb: true }));
  thumbs.forEach((button) => {
    button.addEventListener("click", () => {
      show(Number(button.dataset.albumIndex || 0), { scrollThumb: true });
    });
  });

  album.addEventListener("keydown", (event) => {
    if (ALBUM_PHOTOS.length <= 1) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(activeIndex - 1, { scrollThumb: true });
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(activeIndex + 1, { scrollThumb: true });
    }
  });

  render();
}

function setupPhotoDialog() {
  const dialog = select("#photoDialog");
  const dialogPhoto = select("#dialogPhoto");
  const closeButton = select("#closePhoto");
  if (!dialog || !dialogPhoto || !closeButton) return;

  const closeDialog = () => {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  };

  selectAll("[data-photo-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const photo = select("img", button);
      if (photo) {
        dialogPhoto.src = photo.currentSrc || photo.src;
        dialogPhoto.alt = photo.alt;
      }

      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
  });

  closeButton.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
}

function setupGiftDialog() {
  const openButton = select("#openGift");
  const dialog = select("#giftDialog");
  const closeButton = select("#closeGift");
  const copyStatus = select("#giftCopyStatus");
  if (!openButton || !dialog || !closeButton || !copyStatus) return;

  const accountInputs = new Map([
    ["groomAccount", select("#groomAccount", dialog)],
    ["brideAccount", select("#brideAccount", dialog)],
  ]);
  const copyButtons = selectAll("[data-copy-account]", dialog);
  let scrollLockState = null;
  let copyRequestId = 0;

  const captureScrollState = () => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    rootOverflow: document.documentElement.style.overflow,
    rootScrollBehavior: document.documentElement.style.scrollBehavior,
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    bodyLeft: document.body.style.left,
    bodyRight: document.body.style.right,
    bodyWidth: document.body.style.width,
  });

  const lockPageScroll = (state) => {
    scrollLockState = state;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${state.scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  };

  const restorePageScroll = () => {
    if (!scrollLockState) return;

    const state = scrollLockState;
    scrollLockState = null;
    document.documentElement.style.overflow = state.rootOverflow;
    document.body.style.overflow = state.bodyOverflow;
    document.body.style.position = state.bodyPosition;
    document.body.style.top = state.bodyTop;
    document.body.style.left = state.bodyLeft;
    document.body.style.right = state.bodyRight;
    document.body.style.width = state.bodyWidth;

    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(state.scrollX, state.scrollY);
    document.documentElement.style.scrollBehavior = state.rootScrollBehavior;
  };

  const closeDialog = () => {
    if (dialog.open) dialog.close();
  };

  const copyWithLegacyFallback = (accountNumber, returnFocus) => {
    const textarea = document.createElement("textarea");
    textarea.value = accountNumber;
    textarea.readOnly = true;
    textarea.tabIndex = -1;
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "0";
    textarea.style.opacity = "0";
    textarea.style.fontSize = "16px";
    dialog.append(textarea);

    let copied = false;
    try {
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, accountNumber.length);
      copied = typeof document.execCommand === "function" && document.execCommand("copy") === true;
    } catch {
      copied = false;
    } finally {
      textarea.remove();
    }

    if (copied && typeof returnFocus?.focus === "function") {
      returnFocus.focus({ preventScroll: true });
    }
    return copied;
  };

  const selectAccountForManualCopy = (input) => {
    try {
      input.focus({ preventScroll: true });
      input.select();
      input.setSelectionRange(0, input.value.length);
      return input.selectionStart === 0 && input.selectionEnd === input.value.length;
    } catch {
      try {
        input.focus();
      } catch {
        // The status below still gives an honest manual-copy fallback.
      }
      return false;
    }
  };

  openButton.addEventListener("click", () => {
    if (dialog.open || typeof dialog.showModal !== "function") return;

    const state = captureScrollState();
    try {
      dialog.showModal();
    } catch (error) {
      console.warn("Không thể mở thông tin mừng cưới:", error?.message || error);
      return;
    }

    lockPageScroll(state);
    copyStatus.textContent = "";
    openButton.setAttribute("aria-expanded", "true");
    closeButton.focus({ preventScroll: true });
  });

  closeButton.addEventListener("click", closeDialog);

  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;

    const bounds = dialog.getBoundingClientRect();
    const clickedBackdrop = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (clickedBackdrop) closeDialog();
  });

  dialog.addEventListener("close", () => {
    copyRequestId += 1;
    openButton.setAttribute("aria-expanded", "false");
    restorePageScroll();
    openButton.focus({ preventScroll: true });
  });

  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const input = accountInputs.get(button.dataset.copyAccount);
      if (!input) {
        copyStatus.textContent = "Chưa tìm thấy số tài khoản để sao chép.";
        return;
      }

      const accountNumber = input.value;
      const requestId = ++copyRequestId;
      let copied = false;

      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(accountNumber);
          copied = true;
        }
      } catch {
        copied = false;
      }

      if (requestId !== copyRequestId || !dialog.open) return;
      if (!copied) copied = copyWithLegacyFallback(accountNumber, button);

      if (copied) {
        copyStatus.textContent = `Đã sao chép số tài khoản ${accountNumber}.`;
        return;
      }

      const selected = selectAccountForManualCopy(input);
      copyStatus.textContent = selected
        ? "Số tài khoản đã được chọn. Vui lòng sao chép thủ công."
        : "Chưa thể sao chép tự động. Vui lòng nhấn giữ số tài khoản để sao chép.";
    });
  });
}

function setupMusic() {
  const controls = select("#musicControls");
  const toggle = select("#musicToggle");
  const label = select("#musicToggleLabel");
  const status = select("#musicStatus");
  const audio = select("#weddingAudio");
  if (!controls || !toggle || !label || !status || !audio) return;

  let state = "off";
  let wantsPlayback = false;
  let hasUserStopped = false;
  let hasUsedGestureRetry = false;
  let requestId = 0;
  let gestureRetryArmed = false;

  const isToggleTarget = (target) => target instanceof Node && toggle.contains(target);

  const isEditableTarget = (target) => target instanceof Element
    && Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));

  const handleGestureRetry = (event) => {
    if (!event.isTrusted || !gestureRetryArmed || select("dialog[open]") || isToggleTarget(event.target)) return;
    if (event.type === "keydown") {
      if (
        event.repeat
        || event.isComposing
        || event.ctrlKey
        || event.altKey
        || event.metaKey
        || ["Escape", "Tab", "Shift", "Control", "Alt", "Meta"].includes(event.key)
        || isEditableTarget(event.target)
      ) return;
    }

    disarmGestureRetry();
    hasUsedGestureRetry = true;
    startPlayback({ allowGestureFallback: false });
  };

  const armGestureRetry = () => {
    if (hasUsedGestureRetry || hasUserStopped) return;
    if (gestureRetryArmed) return;
    gestureRetryArmed = true;
    document.addEventListener("pointerup", handleGestureRetry, true);
    document.addEventListener("click", handleGestureRetry, true);
    document.addEventListener("keydown", handleGestureRetry, true);
  };

  function disarmGestureRetry() {
    if (!gestureRetryArmed) return;
    gestureRetryArmed = false;
    document.removeEventListener("pointerup", handleGestureRetry, true);
    document.removeEventListener("click", handleGestureRetry, true);
    document.removeEventListener("keydown", handleGestureRetry, true);
  }

  const setState = (nextState, message) => {
    state = nextState;
    const playbackRequested = state === "loading" || state === "playing";
    controls.dataset.state = state;
    toggle.classList.toggle("is-enabled", playbackRequested);
    toggle.setAttribute("aria-pressed", String(playbackRequested));
    const actionLabel = `${playbackRequested ? "Tắt" : "Bật"} nhạc: ${MUSIC_TRACK_LABEL}`;
    toggle.setAttribute("aria-label", actionLabel);
    toggle.title = actionLabel;
    label.textContent = state === "loading" ? "Đang tải…" : playbackRequested ? "Tắt nhạc" : "Bật nhạc";
    status.textContent = message;
  };

  const stopPlayback = ({ userInitiated = false, message = "Nhạc đã tắt." } = {}) => {
    if (userInitiated) {
      hasUserStopped = true;
      hasUsedGestureRetry = true;
    }
    requestId += 1;
    wantsPlayback = false;
    disarmGestureRetry();
    try {
      audio.pause();
    } catch {
      // State below remains truthful even if a damaged media element rejects pause().
    }
    setState("off", message);
  };

  const mediaErrorMessage = () => {
    if (audio.error?.code === 2) return "Không tải được nhạc. Nhấn Bật nhạc để thử lại.";
    if (audio.error?.code === 3 || audio.error?.code === 4) {
      return "Trình duyệt chưa phát được tệp nhạc này. Nhấn Bật nhạc để thử lại.";
    }
    return "Chưa phát được nhạc. Nhấn Bật nhạc để thử lại.";
  };

  const handlePlayFailure = (error, activeRequest, allowGestureFallback) => {
    if (activeRequest !== requestId || !wantsPlayback || state === "playing") return;
    wantsPlayback = false;

    if (error?.name === "NotAllowedError") {
      setState(
        "blocked",
        allowGestureFallback
          ? "Trình duyệt đã chặn tự phát. Hãy chạm vào trang hoặc nhấn Bật nhạc."
          : "Trình duyệt chưa cho phát nhạc. Nhấn Bật nhạc để thử lại.",
      );
      if (allowGestureFallback) armGestureRetry();
      return;
    }

    disarmGestureRetry();
    setState("error", mediaErrorMessage());
  };

  function startPlayback({ allowGestureFallback = false, retryAfterError = false } = {}) {
    disarmGestureRetry();
    hasUserStopped = false;
    wantsPlayback = true;
    const activeRequest = ++requestId;
    setState("loading", "Đang tải và thử phát nhạc…");

    if (retryAfterError) {
      try {
        audio.load();
      } catch (error) {
        handlePlayFailure(error, activeRequest, false);
        return;
      }
    }

    let playResult;
    try {
      playResult = audio.play();
    } catch (error) {
      handlePlayFailure(error, activeRequest, allowGestureFallback);
      return;
    }

    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch((error) => handlePlayFailure(error, activeRequest, allowGestureFallback));
    }
  }

  audio.addEventListener("playing", () => {
    if (!wantsPlayback || audio.paused) {
      if (!audio.paused) {
        try {
          audio.pause();
        } catch {
          // A late playing event must never resurrect explicitly stopped music.
        }
      }
      return;
    }
    disarmGestureRetry();
    setState("playing", `Đang phát ${MUSIC_TRACK_LABEL}.`);
  });

  audio.addEventListener("waiting", () => {
    if (wantsPlayback) setState("loading", "Đang tải nhạc…");
  });

  audio.addEventListener("stalled", () => {
    if (wantsPlayback) setState("loading", "Kết nối chậm, đang tải nhạc…");
  });

  audio.addEventListener("pause", () => {
    if (wantsPlayback && audio.paused) {
      requestId += 1;
      wantsPlayback = false;
      disarmGestureRetry();
      setState("off", "Nhạc đã tạm dừng.");
    }
  });

  audio.addEventListener("error", () => {
    if (hasUserStopped && !wantsPlayback) return;
    requestId += 1;
    wantsPlayback = false;
    disarmGestureRetry();
    setState("error", mediaErrorMessage());
  });

  toggle.addEventListener("click", () => {
    if (state === "loading" || state === "playing") {
      stopPlayback({ userInitiated: true });
      return;
    }

    hasUsedGestureRetry = true;
    startPlayback({ retryAfterError: state === "error" });
  });

  window.addEventListener("pagehide", () => {
    hasUserStopped = true;
    stopPlayback({ message: "" });
  });

  controls.hidden = false;
  startPlayback({ allowGestureFallback: true });
}

function setupRevealAnimations() {
  const sections = selectAll("[data-reveal]");
  if (!sections.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  sections.forEach((section) => section.classList.add("reveal--ready"));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -7%", threshold: 0.07 },
  );

  sections.forEach((section) => observer.observe(section));
}

function initializeInvitation() {
  const guest = readGuestParam();
  applyGuestName(guest);
  fillCalendar();
  setupCalendarLinks();
  setupCountdown();
  setupRsvp();
  setupWishes();
  setupAlbum();
  setupPhotoDialog();
  setupGiftDialog();
  setupMusic();
  setupRevealAnimations();
}

initializeInvitation();
