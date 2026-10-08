/* Spectre Studio — сборка страниц из data.js и i18n.js */
(function () {
  "use strict";

  var SITE = window.SITE;
  var I18N = window.I18N;
  var LANGS = ["ru", "uz", "en"];
  var DEFAULT_LANG = "ru";
  var page = document.body.getAttribute("data-page");
  var lang = detectLang();

  /* ---------- Язык ---------- */

  function storage(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  function detectLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (LANGS.indexOf(q) !== -1) return q;
    var saved = storage("lang");
    if (LANGS.indexOf(saved) !== -1) return saved;
    return DEFAULT_LANG;
  }

  function setLang(next) {
    lang = next;
    storage("lang", next);
    var params = new URLSearchParams(location.search);
    if (next === DEFAULT_LANG) params.delete("lang"); else params.set("lang", next);
    var qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    render();
  }

  function t(key) {
    var v = I18N[lang][key];
    return v === undefined ? I18N[DEFAULT_LANG][key] : v;
  }

  // Текст из объекта {ru, uz, en}
  function L(obj) {
    if (!obj) return "";
    return obj[lang] || obj[DEFAULT_LANG] || "";
  }

  function plural(n, forms) {
    if (typeof forms === "string") return forms;
    if (lang === "ru") {
      var m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return forms[0];
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
      return forms[2];
    }
    return n === 1 ? forms[0] : forms[forms.length - 1];
  }

  // Внутренняя ссылка с сохранением языка
  function href(path, params) {
    var p = new URLSearchParams(params || {});
    if (lang !== DEFAULT_LANG) p.set("lang", lang);
    var qs = p.toString();
    return path + (qs ? "?" + qs : "");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- Данные ---------- */

  var projects = SITE.projects;

  function project(id) {
    for (var i = 0; i < projects.length; i++) if (projects[i].id === id) return projects[i];
    return null;
  }

  function category(p) {
    return p.type === "series" ? "doc" : p.type;
  }

  function clientNames(p) {
    return (p.clients || []).map(function (c) { return L(SITE.clients[c]); });
  }

  // Оттенок светового пятна на постере — стабильный для каждого проекта
  var HUES = [28, 205, 40, 350, 190, 18, 220, 45, 160, 10];
  function hue(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return HUES[h % HUES.length];
  }

  function stats() {
    var features = 0, docs = 0;
    projects.forEach(function (p) {
      if (p.type === "feature") features++;
      if (p.type === "doc" || p.type === "series") docs++;
    });
    return [
      [projects.length, t("stats.projects")],
      [features, t("stats.features")],
      [docs, t("stats.docs")],
      [Object.keys(SITE.clients).length, t("stats.clients")]
    ];
  }

  /* ---------- Общие блоки ---------- */

  var NAV = [
    ["works", "works.html", "nav.works"],
    ["studio", "studio.html", "nav.studio"],
    ["founder", "founder.html", "nav.founder"],
    ["contact", "contact.html", "nav.contact"]
  ];

  function headerHTML() {
    var active = page === "work" ? "works" : page;
    var links = NAV.map(function (n) {
      return '<a class="nav__link' + (n[0] === active ? " is-active" : "") + '" href="' + href(n[1]) + '">' + t(n[2]) + "</a>";
    }).join("");
    var langs = LANGS.map(function (l) {
      return '<button type="button" data-lang="' + l + '" class="' + (l === lang ? "is-active" : "") + '" aria-pressed="' + (l === lang) + '">' + l.toUpperCase() + "</button>";
    }).join("");
    return (
      '<div class="wrap header__inner">' +
        '<a class="header__logo" href="' + href("index.html") + '" aria-label="Spectre Studio"><img src="assets/img/logo-light.png" alt="Spectre Studio" width="930" height="271"></a>' +
        '<nav class="nav">' +
          '<div class="nav__links" id="nav-links">' + links + "</div>" +
          '<div class="lang" role="group" aria-label="Language">' + langs + "</div>" +
          '<button type="button" class="burger" aria-controls="nav-links" aria-expanded="false" aria-label="' + t("nav.menu") + '"><span></span></button>' +
        "</nav>" +
      "</div>"
    );
  }

  function footerHTML() {
    var c = SITE.contacts;
    var links = NAV.map(function (n) { return '<a href="' + href(n[1]) + '">' + t(n[2]) + "</a>"; }).join("");
    return (
      '<div class="wrap">' +
        '<div class="footer__top">' +
          '<a class="footer__logo" href="' + href("index.html") + '"><img src="assets/img/logo-light.png" alt="Spectre Studio" width="930" height="271" loading="lazy"></a>' +
          '<div class="footer__links">' + links + "</div>" +
        "</div>" +
        '<div class="footer__bottom mono">' +
          "<span>© " + SITE.founded + "–" + new Date().getFullYear() + " Spectre Studio · " + esc(L(c.city)) + "</span>" +
          '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a>" +
          '<a href="#top">' + t("footer.top") + " ↑</a>" +
        "</div>" +
      "</div>"
    );
  }

  function sceneLabel(n, text) {
    return '<div class="scene-label mono reveal">' + t("scene") + " " + pad(n) + (text ? " · " + esc(text) : "") + "</div>";
  }

  function posterHTML(p) {
    if (p.poster) {
      return '<img src="' + esc(p.poster) + '" alt="' + esc(L(p.title)) + '" loading="lazy">';
    }
    var billing = clientNames(p).join(" · ");
    return (
      '<div class="poster" aria-hidden="true">' +
        '<div class="poster__top mono"><span>Spectre Studio</span><span>' + p.year + "</span></div>" +
        "<div>" +
          '<div class="poster__title">' + esc(L(p.title)) + "</div>" +
          '<div class="poster__bottom">' +
            '<div class="poster__billing">' + esc(t("type." + p.type)) + (billing ? " · " + esc(billing) : "") + "</div>" +
            '<img class="poster__logo" src="assets/img/logo-light.png" alt="" loading="lazy">' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function cardHTML(p) {
    var badge = p.status === "production"
      ? '<div class="card__badge mono"><span class="rec-dot"></span>' + t("status.production") + "</div>"
      : "";
    var sub = p.note ? L(p.note) : t("type." + p.type);
    return (
      '<a class="card reveal" data-cat="' + category(p) + '" href="' + href("work.html", { id: p.id }) + '" style="--h:' + hue(p.id) + '">' +
        '<div class="card__poster">' + posterHTML(p) + badge +
          '<div class="card__play"><span><i class="play-icon"></i></span></div>' +
        "</div>" +
        '<div class="card__meta">' +
          "<div>" +
            '<h3 class="card__title">' + esc(L(p.title)) + "</h3>" +
            '<div class="card__sub mono">' + esc(sub) + "</div>" +
          "</div>" +
          '<span class="card__year mono">' + p.year + "</span>" +
        "</div>" +
      "</a>"
    );
  }

  function statsHTML(withSince) {
    var items = stats();
    if (withSince) items.push([SITE.founded, t("stats.since")]);
    return '<div class="stats reveal">' + items.map(function (s) {
      return '<div class="stat"><div class="stat__num">' + s[0] + '</div><div class="stat__label mono">' +
        esc(s[1] === t("stats.since") ? s[1] : plural(s[0], s[1])) + "</div></div>";
    }).join("") + "</div>";
  }

  function creditsHTML(title) {
    var items = Object.keys(SITE.clients).map(function (k) { return "<li>" + esc(L(SITE.clients[k])) + "</li>"; }).join("");
    return (
      '<div class="credits reveal">' +
        '<div class="credits__role mono">' + esc(title) + "</div>" +
        '<ul class="credits__list">' + items + "</ul>" +
      "</div>"
    );
  }

  function ctaHTML() {
    return (
      '<section class="section"><div class="wrap cta reveal">' +
        '<h2 class="h2">' + t("home.cta.title") + "</h2>" +
        "<p>" + t("home.cta.text") + "</p>" +
        '<a class="btn btn--solid" href="' + href("contact.html") + '">' + t("home.cta.button") + ' <span class="arrow">→</span></a>' +
      "</div></section>"
    );
  }

  function rowsHTML(items) {
    return '<div class="rows">' + items.map(function (r, i) {
      return '<div class="row reveal"><span class="row__num mono">' + pad(i + 1) + '</span><h3 class="row__title">' +
        esc(r[0]) + '</h3><p class="row__text">' + esc(r[1]) + "</p></div>";
    }).join("") + "</div>";
  }

  function embedURL(video) {
    if (!video) return null;
    if (video.youtube) return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(video.youtube) + "?rel=0&modestbranding=1&playsinline=1";
    if (video.vimeo) return "https://player.vimeo.com/video/" + encodeURIComponent(video.vimeo) + "?dnt=1&title=0&byline=0&portrait=0";
    return null;
  }

  function iframeHTML(src, title, autoplay) {
    return '<iframe src="' + esc(src + (autoplay ? "&autoplay=1" : "")) + '" title="' + esc(title) +
      '" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen loading="lazy"></iframe>';
  }

  /* ---------- Страницы ---------- */

  function homePage() {
    var reel = SITE.showreel;
    var media = reel && reel.file
      ? '<video src="' + esc(reel.file) + '" autoplay muted loop playsinline></video>'
      : '<div class="hero__beam"></div>';
    var reelBtn = reel && embedURL(reel)
      ? '<button type="button" class="btn" data-reel><i class="play-icon"></i>' + t("hero.cta.reel") + "</button>"
      : "";
    var featured = projects.filter(function (p) { return p.featured; });

    return (
      '<section class="hero">' +
        '<div class="hero__media">' + media + "</div>" +
        '<div class="letterbox letterbox--top"></div><div class="letterbox letterbox--bottom"></div>' +
        '<div class="hud__frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
        '<div class="hud hud--tl mono" aria-hidden="true"><span class="rec-dot"></span>REC</div>' +
        '<div class="hud hud--tr mono" aria-hidden="true" data-timecode>TC 00:00:00:00</div>' +
        '<div class="hud hud--bl mono" aria-hidden="true">24 FPS · 2.39:1</div>' +
        '<div class="hud hud--br mono" aria-hidden="true">SC 01 · TK 01</div>' +
        '<div class="hero__content">' +
          '<div class="hero__kicker mono">' + t("hero.kicker") + "</div>" +
          '<h1><img class="hero__logo" src="assets/img/logo-light.png" alt="Spectre Studio" width="930" height="271"></h1>' +
          '<p class="hero__tagline">' + t("hero.tagline") + "</p>" +
          '<div class="hero__actions">' +
            '<a class="btn btn--solid" href="#work">' + t("hero.cta.works") + ' <span class="arrow">↓</span></a>' +
            reelBtn +
            '<a class="btn" href="' + href("contact.html") + '">' + t("hero.cta.contact") + "</a>" +
          "</div>" +
        "</div>" +
      "</section>" +

      '<section class="section" id="work"><div class="wrap">' +
        '<div class="section-head">' +
          "<div>" + sceneLabel(1) + '<h2 class="h2 reveal">' + t("home.featured") + "</h2></div>" +
          '<a class="link-line reveal" href="' + href("works.html") + '">' + t("home.allWorks") + " (" + projects.length + ') <span>→</span></a>' +
        "</div>" +
        '<div class="grid grid--3">' + featured.map(cardHTML).join("") + "</div>" +
      "</div></section>" +

      '<section class="section"><div class="wrap">' +
        sceneLabel(2) +
        '<div class="split">' +
          '<h2 class="h2 reveal">' + t("home.about.title") + "</h2>" +
          '<div class="reveal"><p class="lead">' + t("home.about.text") + "</p>" +
          '<a class="link-line" href="' + href("studio.html") + '">' + t("home.about.more") + " <span>→</span></a></div>" +
        "</div>" +
        '<div style="margin-top:clamp(56px,8vw,96px)">' + statsHTML(false) + "</div>" +
      "</div></section>" +

      '<section class="section"><div class="wrap">' +
        sceneLabel(3) +
        creditsHTML(t("home.clients")) +
      "</div></section>" +

      ctaHTML()
    );
  }

  function worksPage() {
    var counts = { all: projects.length, feature: 0, doc: 0, promo: 0 };
    projects.forEach(function (p) { counts[category(p)]++; });
    var filters = ["all", "feature", "doc", "promo"].map(function (f, i) {
      return '<button type="button" data-filter="' + f + '" class="' + (i === 0 ? "is-active" : "") + '">' +
        t("works.filter." + f) + "<sup>" + counts[f] + "</sup></button>";
    }).join("");

    return (
      '<section class="page-head"><div class="wrap">' +
        sceneLabel(1) +
        '<h1 class="h1 reveal">' + t("works.title") + "</h1>" +
        '<p class="lead reveal">' + t("works.lead") + "</p>" +
      "</div></section>" +
      '<section class="section section--tight"><div class="wrap">' +
        '<div class="filters reveal" role="group">' + filters + "</div>" +
        '<div class="grid" id="works-grid">' + projects.map(cardHTML).join("") + "</div>" +
        '<div style="margin-top:72px" class="reveal"><a class="link-line" href="' + esc(SITE.vimeoShowcase) + '" target="_blank" rel="noopener">' +
          t("works.vimeo") + " <span>↗</span></a></div>" +
      "</div></section>" +
      ctaHTML()
    );
  }

  function workPage() {
    var id = new URLSearchParams(location.search).get("id");
    var p = project(id);
    if (!p) {
      return (
        '<section class="page-head"><div class="wrap">' +
          '<h1 class="h2">' + t("work.notFound") + "</h1>" +
          '<p style="margin-top:32px"><a class="link-line" href="' + href("works.html") + '">← ' + t("work.back") + "</a></p>" +
        "</div></section>"
      );
    }
    var i = projects.indexOf(p);
    var prev = projects[(i - 1 + projects.length) % projects.length];
    var next = projects[(i + 1) % projects.length];
    var src = embedURL(p.video);

    var player = src
      ? iframeHTML(src, L(p.title))
      : '<div class="player__empty">' +
          '<div class="player__corner player__corner--tl mono">' + (p.status === "production" ? '<span class="rec-dot"></span>' : "") + esc(L(p.title)) + "</div>" +
          '<div class="player__corner player__corner--br mono">' + p.year + " · Spectre Studio</div>" +
          '<div class="h3">' + t(p.status === "production" ? "work.noVideoProduction" : "work.noVideo") + "</div>" +
          (p.status === "production" ? "" :
            '<a class="btn" href="' + esc(SITE.vimeoShowcase) + '" target="_blank" rel="noopener"><i class="play-icon"></i>' + t("work.watchVimeo") + "</a>") +
        "</div>";

    var slate = [
      [t("work.type"), esc(t("type." + p.type))],
      [t("work.year"), p.year],
      [t("work.status"), esc(p.status === "production" ? t("status.production") : t("work.released"))],
      [t("work.client"), clientNames(p).map(esc).join("<br>")]
    ].map(function (s) {
      return '<div><dt class="mono">' + esc(s[0]) + "</dt><dd>" + s[1] + "</dd></div>";
    }).join("");

    return (
      '<section class="work-head"><div class="wrap">' +
        '<a class="back mono" href="' + href("works.html") + '">← ' + t("work.back") + "</a>" +
        '<div class="scene-label mono">' + esc(t("type." + p.type)) + " · " + p.year + "</div>" +
        '<h1 class="h1">' + esc(L(p.title)) + "</h1>" +
        (p.note ? '<p class="work-head__note">' + esc(L(p.note)) + "</p>" : "") +
        (p.logline ? '<p class="lead" style="margin-top:24px">' + esc(L(p.logline)) + "</p>" : "") +
      "</div></section>" +
      '<section><div class="wrap">' +
        '<div class="player" style="--h:' + hue(p.id) + '">' + player + "</div>" +
        '<dl class="slate">' + slate + "</dl>" +
        '<nav class="pager">' +
          '<a href="' + href("work.html", { id: prev.id }) + '"><span class="mono">← ' + t("work.prev") + '</span><span class="h3">' + esc(L(prev.title)) + "</span></a>" +
          '<a href="' + href("work.html", { id: next.id }) + '"><span class="mono">' + t("work.next") + ' →</span><span class="h3">' + esc(L(next.title)) + "</span></a>" +
        "</nav>" +
      "</div></section>" +
      ctaHTML()
    );
  }

  function studioPage() {
    return (
      '<section class="page-head"><div class="wrap">' +
        sceneLabel(1) +
        '<h1 class="h1 reveal">' + t("studio.title") + "</h1>" +
        '<p class="lead reveal">' + t("studio.lead") + "</p>" +
      "</div></section>" +
      '<section class="section section--tight"><div class="wrap">' +
        statsHTML(true) +
      "</div></section>" +
      '<section class="section"><div class="wrap">' +
        sceneLabel(2) +
        '<div class="split">' +
          '<h2 class="h2 reveal">' + t("studio.story.title") + "</h2>" +
          '<div class="reveal"><p class="lead">' + t("studio.story.p1") + '</p><p class="lead">' + t("studio.story.p2") + "</p></div>" +
        "</div>" +
      "</div></section>" +
      '<section class="section"><div class="wrap">' +
        sceneLabel(3) +
        '<h2 class="h2 reveal" style="margin-bottom:56px">' + t("studio.services.title") + "</h2>" +
        rowsHTML(t("studio.services")) +
      "</div></section>" +
      '<section class="section"><div class="wrap">' +
        sceneLabel(4) +
        '<h2 class="h2 reveal" style="margin-bottom:56px">' + t("studio.process.title") + "</h2>" +
        rowsHTML(t("studio.process")) +
      "</div></section>" +
      '<section class="section"><div class="wrap">' +
        sceneLabel(5) +
        creditsHTML(t("studio.clients.title")) +
      "</div></section>" +
      ctaHTML()
    );
  }

  function founderPage() {
    var f = SITE.founder;
    var bio = (f.bio[lang] || f.bio[DEFAULT_LANG]).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    return (
      '<section class="page-head"><div class="wrap">' +
        sceneLabel(1, t("founder.title")) +
        '<div class="founder">' +
          '<figure class="founder__photo reveal" style="margin:0"><img src="' + esc(f.photo) + '" alt="' + esc(L(f.name)) + '">' +
            '<figcaption class="mono">' + esc(L(f.name)) + "</figcaption></figure>" +
          '<div class="reveal">' +
            '<h1 class="founder__name">' + esc(L(f.name)) + "</h1>" +
            '<div class="founder__role mono">' + esc(L(f.role)) + "</div>" +
            '<div class="founder__bio">' + bio + "</div>" +
            '<div style="margin-top:48px"><a class="link-line" href="' + href("works.html") + '">' + t("home.allWorks") + " <span>→</span></a></div>" +
          "</div>" +
        "</div>" +
      "</div></section>" +
      ctaHTML()
    );
  }

  function contactPage() {
    var c = SITE.contacts;
    var mail = "mailto:" + c.email + "?subject=" + encodeURIComponent(t("contact.subject"));
    var items = [
      [t("contact.email"), c.email, "mailto:" + c.email],
      [t("contact.phone"), c.phone, "tel:" + c.phone.replace(/[^\d+]/g, "")],
      [t("contact.telegram"), "@" + c.telegram, "https://t.me/" + c.telegram],
      [t("contact.instagram"), "@" + c.instagram, "https://instagram.com/" + c.instagram],
      [t("contact.city"), L(c.city), null]
    ];
    var cards = items.map(function (it) {
      var ext = it[2] && it[2].indexOf("http") === 0 ? ' target="_blank" rel="noopener"' : "";
      var inner = '<span class="mono">' + esc(it[0]) + '</span><span class="contact__value">' + esc(it[1]) + "</span>";
      return it[2] ? '<a class="contact" href="' + esc(it[2]) + '"' + ext + ">" + inner + "</a>" : '<div class="contact">' + inner + "</div>";
    }).join("");

    return (
      '<section class="page-head"><div class="wrap">' +
        sceneLabel(1, t("contact.title")) +
        '<h1 class="h1 reveal">' + t("contact.lead") + "</h1>" +
        '<p class="lead reveal">' + t("contact.text") + "</p>" +
        '<div class="reveal" style="margin-top:44px"><a class="btn btn--solid" href="' + esc(mail) + '">' + t("contact.write") + ' <span class="arrow">→</span></a></div>' +
      "</div></section>" +
      '<section class="section section--tight"><div class="wrap">' +
        '<div class="contacts reveal">' + cards + "</div>" +
      "</div></section>"
    );
  }

  var PAGES = {
    home: [homePage, null],
    works: [worksPage, "nav.works"],
    work: [workPage, null],
    studio: [studioPage, "nav.studio"],
    founder: [founderPage, "nav.founder"],
    contact: [contactPage, "nav.contact"]
  };

  /* ---------- Поведение ---------- */

  var timecodeTimer = null;
  function startTimecode() {
    clearInterval(timecodeTimer);
    var el = document.querySelector("[data-timecode]");
    if (!el) return;
    var start = performance.now();
    timecodeTimer = setInterval(function () {
      var frames = Math.floor((performance.now() - start) / (1000 / 24));
      var f = frames % 24, s = Math.floor(frames / 24) % 60, m = Math.floor(frames / 1440) % 60, h = Math.floor(frames / 86400);
      el.textContent = "TC " + pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
    }, 1000 / 24);
  }

  var observer = null;
  function setupReveal() {
    if (observer) observer.disconnect();
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); observer.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { observer.observe(el); });
  }

  function setupFilters() {
    var group = document.querySelector(".filters");
    if (!group) return;
    group.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-filter]");
      if (!btn) return;
      var f = btn.getAttribute("data-filter");
      group.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-active", b === btn); });
      document.querySelectorAll("#works-grid .card").forEach(function (card) {
        var show = f === "all" || card.getAttribute("data-cat") === f;
        card.classList.toggle("is-hidden", !show);
        if (show) card.classList.add("is-in");
      });
    });
  }

  function openReel() {
    var src = embedURL(SITE.showreel);
    if (!src) return;
    var modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = '<button type="button" class="modal__close mono">' + t("nav.close") + ' ✕</button>' +
      '<div class="modal__inner"><div class="player">' + iframeHTML(src, "Spectre Studio — Showreel", true) + "</div></div>";
    document.body.appendChild(modal);
    requestAnimationFrame(function () { modal.classList.add("is-open"); });
    function close() {
      modal.classList.remove("is-open");
      document.removeEventListener("keydown", onKey);
      setTimeout(function () { modal.remove(); }, 400);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    modal.addEventListener("click", function (e) { if (e.target === modal || e.target.closest(".modal__close")) close(); });
    document.addEventListener("keydown", onKey);
  }

  function bindHeader(header) {
    header.addEventListener("click", function (e) {
      var l = e.target.closest("[data-lang]");
      if (l) { setLang(l.getAttribute("data-lang")); return; }
      if (e.target.closest(".burger")) {
        var open = document.body.classList.toggle("menu-open");
        e.target.closest(".burger").setAttribute("aria-expanded", open);
      }
    });
  }

  function onScroll() {
    var h = document.querySelector(".header");
    if (h) h.classList.toggle("is-solid", window.scrollY > 40 || page !== "home");
  }

  /* ---------- Рендер ---------- */

  var header, main, footer;

  function render() {
    var def = PAGES[page] || PAGES.home;
    document.documentElement.lang = lang;
    document.body.classList.remove("menu-open");

    header.innerHTML = headerHTML();
    main.innerHTML = def[0]();
    footer.innerHTML = footerHTML();

    var title = page === "work"
      ? (project(new URLSearchParams(location.search).get("id")) || { title: null }).title
      : null;
    document.title = title ? L(title) + " — Spectre Studio"
      : def[1] ? t(def[1]) + " — Spectre Studio"
      : t("meta.title");
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("meta.description"));

    setupReveal();
    setupFilters();
    startTimecode();
    onScroll();
  }

  function init() {
    document.body.id = "top";
    var grain = document.createElement("div");
    grain.className = "grain";
    grain.setAttribute("aria-hidden", "true");

    header = document.createElement("header");
    header.className = "header";
    main = document.querySelector("main") || document.createElement("main");
    footer = document.createElement("footer");
    footer.className = "footer";

    document.body.insertBefore(header, document.body.firstChild);
    document.body.appendChild(footer);
    document.body.appendChild(grain);

    bindHeader(header);
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-reel]")) openReel();
      if (e.target.closest(".nav__link")) document.body.classList.remove("menu-open");
    });
    window.addEventListener("scroll", onScroll, { passive: true });

    render();
  }

  init();
})();
