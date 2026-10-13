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

const ALBUM_PHOTOS = [
  {
    src: "/assets/couple-photo.png",
    alt: "Hữu Thắng và Thu Trang giữa khu vườn hoa",
    position: "50% 18%",
  },
  {
    src: "/assets/couple-photo.png",
    alt: "Khoảnh khắc dịu dàng của cô dâu chú rể",
    position: "50% 38%",
  },
  {
    src: "/assets/couple-photo.png",
    alt: "Bó hoa và váy cưới của Thu Trang",
    position: "40% 64%",
  },
  {
    src: "/assets/couple-photo.png",
    alt: "Hữu Thắng và Thu Trang trong ngày cưới",
    position: "68% 82%",
  },
];

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
// The linked Zing embed currently shows a promo card without playback controls.
// Use the same studio recording supplied on Duc Phuc's official YouTube channel.
const MUSIC_EMBED_URL = "https://www.youtube.com/embed/-GgTYmhzviw?enablejsapi=1&playsinline=1&rel=0";

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
  const mainImage = select("#albumImage");
  const previousButton = select("#albumPrev");
  const nextButton = select("#albumNext");
  const counter = select("#albumCounter");
  const thumbs = selectAll("[data-album-index]");
  if (!album || !mainImage || !previousButton || !nextButton || !counter || !thumbs.length) return;

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
      const thumbImage = select("img", button);
      if (thumbImage && ALBUM_PHOTOS[index]) {
        thumbImage.src = ALBUM_PHOTOS[index].src;
        thumbImage.style.objectPosition = ALBUM_PHOTOS[index].position;
      }
    });
  };

  const show = (index) => {
    activeIndex = (index + ALBUM_PHOTOS.length) % ALBUM_PHOTOS.length;
    render();
  };

  previousButton.addEventListener("click", () => show(activeIndex - 1));
  nextButton.addEventListener("click", () => show(activeIndex + 1));
  thumbs.forEach((button) => {
    button.addEventListener("click", () => show(Number(button.dataset.albumIndex || 0)));
  });

  album.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(activeIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(activeIndex + 1);
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
  const panel = select("#musicPanel");
  const host = select("#musicEmbedHost");
  const closeButton = select("#closeMusic");
  const status = select("#musicStatus");
  if (!controls || !toggle || !label || !panel || !host || !closeButton || !status) return;

  let isPlayerEnabled = false;
  let loadTimeout = null;
  let player = null;
  let playerApi = null;
  let requestId = 0;

  const loadPlayerApi = () => {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (playerApi) return playerApi;

    playerApi = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      let apiTimeout;
      const failed = () => {
        window.clearTimeout(apiTimeout);
        script.remove();
        playerApi = null;
        reject(new Error("YouTube player API unavailable"));
      };
      window.onYouTubeIframeAPIReady = () => {
        window.clearTimeout(apiTimeout);
        resolve(window.YT);
      };
      script.addEventListener("error", failed, { once: true });
      apiTimeout = window.setTimeout(failed, 15000);
      document.head.append(script);
    });
    return playerApi;
  };

  const updateToggle = () => {
    toggle.classList.toggle("is-enabled", isPlayerEnabled);
    toggle.setAttribute("aria-pressed", String(isPlayerEnabled));
    toggle.setAttribute("aria-expanded", String(isPlayerEnabled));
    toggle.setAttribute("aria-label", `${isPlayerEnabled ? "Tắt" : "Bật"} nhạc: Ánh Nắng Của Anh – Đức Phúc`);
    label.textContent = isPlayerEnabled ? "Tắt nhạc" : "Bật nhạc";
  };

  const disablePlayer = (returnFocus = false) => {
    requestId += 1;
    isPlayerEnabled = false;
    window.clearTimeout(loadTimeout);
    loadTimeout = null;
    try {
      player?.destroy();
    } catch {
      // Removing the frame below also stops the player if its API is unavailable.
    }
    player = null;
    // Removing the cross-origin player stops its audio; hiding it alone does not.
    host.replaceChildren();
    panel.hidden = true;
    status.textContent = "";
    updateToggle();
    if (returnFocus) toggle.focus({ preventScroll: true });
  };

  const enablePlayer = () => {
    if (isPlayerEnabled) return;
    isPlayerEnabled = true;
    const activeRequest = ++requestId;
    const isCurrentRequest = () => isPlayerEnabled && activeRequest === requestId;
    panel.hidden = false;
    status.textContent = "Đang mở trình phát nhạc…";
    updateToggle();

    const frame = document.createElement("iframe");
    frame.title = "Ánh Nắng Của Anh (Chờ Em Đến Ngày Mai OST) – Đức Phúc, bản thu chính thức";
    frame.allow = "autoplay; encrypted-media";
    // YouTube requires a referrer. Send the site origin only, never the guest query.
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    const embedUrl = new URL(MUSIC_EMBED_URL);
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      embedUrl.searchParams.set("origin", window.location.origin);
    }
    frame.src = embedUrl.toString();
    frame.addEventListener("load", () => {
      if (!isCurrentRequest() || !frame.isConnected) return;
      // An iframe load does not tell us whether playback actually started.
      status.textContent = "Nếu nhạc chưa tự phát, hãy nhấn Play trong trình phát.";
    });
    host.replaceChildren(frame);
    loadTimeout = window.setTimeout(() => {
      if (!isCurrentRequest() || !frame.isConnected) return;
      status.textContent = "Nếu khung nhạc chưa tải được, bạn có thể mở bài hát từ liên kết bên dưới.";
    }, 12000);

    void loadPlayerApi().then((api) => {
      if (!isCurrentRequest() || !frame.isConnected) return;
      player = new api.Player(frame, {
        events: {
          onReady: (event) => {
            if (!isCurrentRequest()) return;
            window.clearTimeout(loadTimeout);
            loadTimeout = null;
            status.textContent = "Nếu nhạc chưa tự phát, hãy nhấn Play trong trình phát.";
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (!isCurrentRequest()) return;
            if (event.data === api.PlayerState.PLAYING) status.textContent = "Đang phát Ánh Nắng Của Anh – Đức Phúc.";
            if (event.data === api.PlayerState.PAUSED) status.textContent = "Nhạc đang tạm dừng. Nhấn Play để nghe tiếp.";
            if (event.data === api.PlayerState.ENDED) status.textContent = "Bài hát đã kết thúc. Nhấn Play để nghe lại.";
          },
          onAutoplayBlocked: () => {
            if (isCurrentRequest()) status.textContent = "Chạm nút Play trong trình phát để bắt đầu nghe nhạc.";
          },
          onError: () => {
            if (!isCurrentRequest()) return;
            window.clearTimeout(loadTimeout);
            loadTimeout = null;
            status.textContent = "Bài hát chưa phát được trong khung này. Bạn có thể nghe qua liên kết bên dưới.";
          },
        },
      });
    }).catch(() => {
      if (!isCurrentRequest()) return;
      status.textContent = "Bạn có thể nhấn Play trong khung nhạc hoặc mở bài hát từ liên kết bên dưới.";
    });
  };

  toggle.addEventListener("click", () => {
    if (isPlayerEnabled) disablePlayer();
    else enablePlayer();
  });
  closeButton.addEventListener("click", () => disablePlayer(true));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isPlayerEnabled || select("dialog[open]")) return;
    disablePlayer(true);
  });
  window.addEventListener("pagehide", () => disablePlayer());
  controls.hidden = false;
  updateToggle();
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
