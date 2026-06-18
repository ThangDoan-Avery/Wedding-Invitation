const wedding = {
  invitationSide: "Tr",
  groom: "Hữu Thắng",
  bride: "Thu Trang",
  dateISO: "2026-11-13T09:00:00+07:00",
  ceremonyISO: "2026-11-13T09:00:00+07:00",
  displayDate: "13 tháng 11, 2026",
  ceremonyHour: "09:00",
  partyTime: "09:00",
  day: "13",
  month: "11",
  year: "2026",
  address: "Thôn Ấp Giáo, xã Vĩnh Hải, thành phố Hải Phòng",
  mapUrl: "https://maps.app.goo.gl/WYMqWyaiVoQQLs1M6",
  mapEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d846.2249474714474!2d106.48020222626349!3d20.6429102359104!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3135f5e2b65295b1%3A0x8c740e574d1ab8f2!2zw4FvIETDoGkgVGjhu51pIFRyYW5nIEzGsHUgVGjhuqFuaA!5e1!3m2!1sen!2s!4v1781679031487!5m2!1sen!2s",
  calendarUrl:
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Ti盻㌘%20cﾆｰ盻嬖%20H盻ｯu%20Th蘯ｯng%20%26%20Thu%20Trang&dates=20261220T040000Z/20261220T070000Z&details=Trﾃ｢n%20tr盻肱g%20kﾃｭnh%20m盻拱%20b蘯｡n%20ﾄ黛ｺｿn%20chung%20vui&location=The%20Silk%20Garden%2C%20TP.%20H盻・20Chﾃｭ%20Minh",
  phone: "tel:+84901234567",
  groomParents: ["Đoàn Văn Lưu", "Phạm Thị Thạnh"],
  brideParents: ["Phạm Văn Trung", "Bùi Thị Chấn"],
  groomAddress: "25 Lê Lợi, Minh Khai, Hồng Bàng, Hải Phòng",
  brideAddress: "76 Điện Biên Phủ, Hồng Bàng, Hải Phòng",
  photos: [
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 1" },
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 2" },
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 3" },
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 4" },
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 5" },
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 6" },
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 7" },
    { src: "/assets/couple-photo.png", alt: "Anh cuoi 8" },
  ],
  timeline: [
    { time: "09:00", title: "Đón khách" },
    { time: "09:30", title: "Khai tiệc" },
    { time: "12:00", title: "Đón dâu" },
    { time: "12:50", title: "Tiệc mừng" },
    { time: "14:00", title: "Kết thúc tiệc" },
  ],
  gifts: {
    groom: {
      name: "Chú rể Hữu Thắng",
      bank: "MB Bank - 0123456789",
      qrImage: "",
      qrData: "Mừng cưới chú rể Hữu Thắng - MB Bank 0123456789",
    },
    bride: {
      name: "Cô dâu Thu Trang",
      bank: "Vietcombank - 0987654321",
      qrImage: "",
      qrData: "Mừng cưới cô dâu Thu Trang - Vietcombank 0987654321",
    },
  },
};

const $ = (selector) => document.querySelector(selector);
const SUPABASE_URL = "https://fqafkaihbwgjqcabvisg.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_COjqwVjlb0fTmkkAxQ7PbA_SQqdcm5K";
const WISH_TABLE = "wedding_wishes";
const RSVP_TABLE = "wedding_rsvps";

let supabaseClient;

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY || !window.supabase) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  }
  return supabaseClient;
}

function setMusicPlaybackState(isPlaying) {
  const player = $("#musicPlayer");
  const iframe = $("#musicPlayer iframe");
  const button = $("#musicToggle");
  if (!player || !iframe || !button) return;

  player.classList.remove("is-visible");
  iframe.src = isPlaying ? iframe.dataset.src : "about:blank";
  button.classList.toggle("is-playing", isPlaying);
  button.setAttribute("aria-label", isPlaying ? "T蘯｡m d盻ｫng nh蘯｡c" : "B蘯ｭt nh蘯｡c");
  button.setAttribute("title", isPlaying ? "T蘯｡m d盻ｫng nh蘯｡c" : "B蘯ｭt nh蘯｡c");
  button.innerHTML = `<i data-lucide="${isPlaying ? "pause" : "music"}"></i>`;
  refreshIcons();
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function qrUrl(image, data) {
  if (image) return image;
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(data)}`;
}

function namesWithBreak() {
  return `${wedding.groom}<br /><span>&</span><br />${wedding.bride}`;
}

function fillCalendar() {
  const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const year = Number(wedding.year);
  const monthIndex = Number(wedding.month) - 1;
  const blanks = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const selected = Number(wedding.day);
  const cells = [
    ...Array.from({ length: blanks }, () => `<span></span>`),
    ...Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1;
      return `<span class="${day === selected ? "is-selected" : ""}">${day}</span>`;
    }),
  ].join("");

  $("#calendar").innerHTML = `
    <div class="calendar__month">Thﾃ｡ng ${wedding.month} / ${wedding.year}</div>
    <div class="calendar__week">${days.map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="calendar__days">${cells}</div>
  `;
}

function setupCountdown() {
  const element = $("#countdownText");
  if (!element) return;

  const target = new Date(wedding.dateISO).getTime();

  const render = () => {
    const remaining = target - Date.now();
    if (remaining <= 0) {
      element.textContent = "ﾄ静｣ ﾄ黛ｺｿn ngﾃy vui";
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    element.setAttribute("aria-label", `${days} ngay ${hours} gio ${minutes} phut ${seconds} giay`);
    element.innerHTML = [
      { value: days, label: "Ngay" },
      { value: hours, label: "Gio" },
      { value: minutes, label: "Phut" },
      { value: seconds, label: "Giay" },
    ]
      .map(
        (item) => `
          <span class="countdown-item">
            <strong>${String(item.value).padStart(2, "0")}</strong>
            <small>${item.label}</small>
          </span>
        `,
      )
      .join("");
  };

  render();
  window.setInterval(render, 1000);
}

function fillContent() {
  const names = `${wedding.groom} & ${wedding.bride}`;
  document.title = `Thi盻㎝ cﾆｰ盻嬖 ${names}`;
  $("#coverNames").innerHTML = namesWithBreak();
  $("#heroNames").innerHTML = namesWithBreak();
  $("#announcementNames").innerHTML = namesWithBreak();
  setText("#coverDate", wedding.displayDate);
  setText("#groomParents", wedding.groomParents.join("\n"));
  setText("#brideParents", wedding.brideParents.join("\n"));
  setText("#groomAddress", wedding.groomAddress);
  setText("#brideAddress", wedding.brideAddress);
  setText("#ceremonyHour", wedding.ceremonyHour);
  setText("#ceremonyDay", wedding.day);
  setText("#ceremonyYear", wedding.year);
  setText("#partyTime", wedding.partyTime);
  setText("#partyDay", wedding.day);
  setText("#partyYear", wedding.year);
  setText("#mapAddress", wedding.address);
  setText("#groomQrName", wedding.gifts.groom.name);
  setText("#groomBank", wedding.gifts.groom.bank);
  setText("#brideQrName", wedding.gifts.bride.name);
  setText("#brideBank", wedding.gifts.bride.bank);

  $("#mapLink").href = wedding.mapUrl;
  $("#mapEmbed").src = wedding.mapEmbedUrl;
  $("#calendarLink").href = wedding.calendarUrl;
  $("#groomQrImage").src = qrUrl(wedding.gifts.groom.qrImage, wedding.gifts.groom.qrData);
  $("#brideQrImage").src = qrUrl(wedding.gifts.bride.qrImage, wedding.gifts.bride.qrData);

  const visiblePhotos = wedding.photos.slice(0, 4);
  const extraCount = Math.max(0, wedding.photos.length - visiblePhotos.length);

  $("#photoGrid").innerHTML = visiblePhotos
    .map((photo, index) => {
      const isLastVisible = index === visiblePhotos.length - 1 && extraCount > 0;
      return `
        <button class="album-tile" type="button" data-album-open="${index}">
          <img src="${photo.src}" alt="${photo.alt}" class="photo-${(index % 4) + 1}" loading="lazy" />
          ${isLastVisible ? `<span class="album-more">+${extraCount}</span>` : ""}
        </button>
      `;
    })
    .join("");

  $("#albumThumbs").innerHTML = wedding.photos
    .map(
      (photo, index) =>
        `<button class="lightbox__thumb" type="button" data-album-index="${index}" aria-label="View image ${index + 1}">
          <img src="${photo.src}" alt="Thumbnail ${index + 1}" draggable="false" />
        </button>`,
    )
    .join("");

  // Timeline section is currently hidden in the invitation HTML files.
  // $("#timelineList").innerHTML = wedding.timeline
  //   .map(
  //     (item) => `
  //       <article class="timeline__item">
  //         <span>${item.time}</span>
  //         <strong>${item.title}</strong>
  //       </article>
  //     `,
  //   )
  //   .join("");

  fillCalendar();
}

function setupAlbumLightbox() {
  const lightbox = $("#albumLightbox");
  const openButtons = document.querySelectorAll("[data-album-open]");
  const closeButton = $("#closeAlbum");
  const prevButton = $("#prevPhoto");
  const nextButton = $("#nextPhoto");
  const activeImage = $("#activeAlbumImage");
  const counter = $("#albumCounter");
  const thumbButtons = Array.from(document.querySelectorAll("[data-album-index]"));
  let activeIndex = 0;

  const update = () => {
    const photo = wedding.photos[activeIndex];
    activeImage.src = photo.src;
    activeImage.alt = photo.alt || `蘯｢nh cﾆｰ盻嬖 ${activeIndex + 1}`;
    counter.textContent = `${activeIndex + 1} / ${wedding.photos.length}`;
    thumbButtons.forEach((button, index) => {
      const isActive = index === activeIndex;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-current", isActive ? "true" : "false");
      if (isActive) button.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  };

  const open = (index = 0) => {
    activeIndex = index;
    update();
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
  };

  const close = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
  };

  const showPrev = () => {
    activeIndex = (activeIndex - 1 + wedding.photos.length) % wedding.photos.length;
    update();
  };

  const showNext = () => {
    activeIndex = (activeIndex + 1) % wedding.photos.length;
    update();
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", () => open(Number(button.dataset.albumOpen || 0)));
  });
  thumbButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeIndex = Number(button.dataset.albumIndex || 0);
      update();
    });
  });
  prevButton.addEventListener("click", showPrev);
  nextButton.addEventListener("click", showNext);
  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) close();
  });
  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("is-open")) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") showPrev();
    if (event.key === "ArrowRight") showNext();
  });
}

function setupCover() {
  document.body.classList.add("is-locked");
  $("#openInvite").addEventListener("click", () => {
    $("#cover").classList.add("is-open");
    document.body.classList.remove("is-locked");
    setMusicPlaybackState(false);
  });
}

async function setupWishes() {
  const form = $("#wishForm");
  const list = $("#wishList");
  const db = getSupabaseClient();
  let saved = JSON.parse(localStorage.getItem("wedding-wishes") || "[]");

  const render = () => {
    list.innerHTML = saved.length
      ? saved
      .map(
        (wish) => `
          <article class="wish-item">
            <strong>${wish.name}</strong>
            <time>${wish.time}</time>
            <p>${wish.text}</p>
          </article>
        `,
      )
      .join("")
      : `<article class="wish-item"><p>Hﾃ｣y lﾃ ngﾆｰ盻拱 ﾄ黛ｺｧu tiﾃｪn g盻ｭi l盻拱 chﾃｺc ﾄ黛ｺｿn cﾃｴ dﾃ｢u chﾃｺ r盻・</p></article>`;
  };

  if (saved.length === 0) {
    saved.push(
      { name: "B蘯｡n thﾃ｢n", time: "20.04.2026", text: "Chﾃｺc hai b蘯｡n trﾄノ nﾄノ h蘯｡nh phﾃｺc." },
      { name: "ﾄ雪ｻ渡g nghi盻㎝", time: "20.04.2026", text: "Chﾃｺc ngﾃy vui th蘯ｭt tr盻肱 v蘯ｹn vﾃ 蘯･m ﾃ｡p." },
    );
  }

  const loadFromSupabase = async () => {
    if (!db) return;

    const { data, error } = await db
      .from(WISH_TABLE)
      .select("name,message,created_at")
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.warn("Khﾃｴng th盻・t蘯｣i s盻・lﾆｰu bﾃｺt t盻ｫ Supabase:", error.message);
      return;
    }

    saved = data.map((wish) => ({
      name: wish.name,
      text: wish.message,
      time: new Date(wish.created_at).toLocaleDateString("vi-VN"),
    }));
    render();
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#guestName").value.trim();
    const text = $("#guestWish").value.trim();
    if (!name || !text) return;

    const wish = {
      name,
      text,
      time: new Date().toLocaleDateString("vi-VN"),
    };

    if (db) {
      const { error } = await db.from(WISH_TABLE).insert({ name, message: text });
      if (error) {
        console.warn("Khﾃｴng th盻・g盻ｭi l盻拱 chﾃｺc lﾃｪn Supabase:", error.message);
        return;
      }
      await loadFromSupabase();
    } else {
      saved.unshift(wish);
      localStorage.setItem("wedding-wishes", JSON.stringify(saved.slice(0, 8)));
      render();
    }

    form.reset();
  });

  render();
  await loadFromSupabase();
}

function setupRsvp() {
  const modal = $("#rsvpModal");
  const openButton = $("#openRsvp");
  const closeButton = $("#closeRsvp");
  const form = $("#rsvpForm");
  const status = $("#rsvpStatus");
  const submitButton = form?.querySelector(".rsvp-submit");
  const db = getSupabaseClient();
  if (!modal || !openButton || !closeButton || !form) return;

  const open = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    $("#rsvpName")?.focus();
  };

  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
  };

  openButton.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#rsvpName").value.trim();
    const attendance = form.elements.attendance.value;
    if (!name) return;

    status.textContent = "ﾄ紳ng g盻ｭi xﾃ｡c nh蘯ｭn...";
    status.classList.remove("is-error");
    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    const payload = {
      name,
      attendance,
      attending: attendance === "yes",
      invitation_side: wedding.invitationSide,
      created_at: new Date().toISOString(),
    };

    if (db) {
      const { error } = await db.from(RSVP_TABLE).insert({
        name: payload.name,
        attendance: payload.attendance,
        attending: payload.attending,
        invitation_side: payload.invitation_side,
      });

      if (error) {
        console.warn("Khﾃｴng th盻・g盻ｭi xﾃ｡c nh蘯ｭn lﾃｪn Supabase:", error.message);
        status.textContent = "Chﾆｰa g盻ｭi ﾄ柁ｰ盻｣c lﾃｪn database. Vui lﾃｲng ki盻ノ tra b蘯｣ng wedding_rsvps trong Supabase.";
        status.classList.add("is-error");
        submitButton.disabled = false;
        submitButton.classList.remove("is-loading");
        return;
      }
    } else {
      const saved = JSON.parse(localStorage.getItem("wedding-rsvps") || "[]");
      saved.unshift(payload);
      localStorage.setItem("wedding-rsvps", JSON.stringify(saved.slice(0, 30)));
    }

    status.textContent = "C蘯｣m ﾆ｡n b蘯｡n, xﾃ｡c nh蘯ｭn ﾄ妥｣ ﾄ柁ｰ盻｣c ghi nh蘯ｭn.";
    form.reset();
    form.elements.attendance.value = "yes";
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
    window.setTimeout(close, 900);
  });
}

function setupMusicToggle() {
  const button = $("#musicToggle");
  setMusicPlaybackState(false);

  button.addEventListener("click", () => {
    setMusicPlaybackState(!button.classList.contains("is-playing"));
  });
}

fillContent();
setupAlbumLightbox();
setupCover();
setupWishes();
setupCountdown();
setupRsvp();
setupMusicToggle();
lucide.createIcons();
