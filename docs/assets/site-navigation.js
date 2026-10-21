(() => {
  "use strict";

  const nav = document.querySelector(".nav-links");
  const menuToggle = document.querySelector(".nav-menu-toggle");
  if (!nav) return;

  function setMobileMenuOpen(open) {
    if (!menuToggle) return;
    nav.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      setMobileMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("click", event => {
      if (!nav.contains(event.target) && !menuToggle.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
        setMobileMenuOpen(false);
        menuToggle.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 581px)").matches) setMobileMenuOpen(false);
    }, { passive: true });
  }

  const sectionLinks = Array.from(nav.querySelectorAll("a[data-section]"));
  const faqLink = nav.querySelector('a[data-page="faq"]');
  const topbar = document.querySelector(".topbar");
  const root = document.documentElement;
  const isHome = document.body.classList.contains("home-page");
  const homePath = sectionLinks.length
    ? new URL(sectionLinks[0].href, window.location.href).pathname
    : "/";
  const PENDING_SECTION_KEY = "moonlight-site-pending-section-v1";

  let scrollFrame = 0;
  let savedScrollBehavior = null;
  let activeUpdateFrame = 0;

  function setActive(link, currentType = "location") {
    for (const item of sectionLinks.concat(faqLink ? [faqLink] : [])) {
      const active = item === link;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", currentType);
      else item.removeAttribute("aria-current");
    }
  }

  function stopAnimation() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    if (savedScrollBehavior !== null) {
      root.style.scrollBehavior = savedScrollBehavior;
      savedScrollBehavior = null;
    }
  }

  function animateTo(target) {
    if (!target) return;
    stopAnimation();

    const startY = window.scrollY;
    const barHeight = topbar ? topbar.getBoundingClientRect().height : 0;
    const scrollMargin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const endY = Math.max(
      0,
      target.getBoundingClientRect().top + startY - barHeight - scrollMargin - 12
    );

    if (Math.abs(endY - startY) < 2) {
      window.scrollTo(0, endY);
      return;
    }

    // Animate coordinates directly; this also works in browsers where
    // scrollIntoView({ behavior: "smooth" }) is ignored or inconsistent.
    savedScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";

    const duration = Math.min(900, Math.max(440, Math.abs(endY - startY) * 0.32));
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      window.scrollTo(0, startY + (endY - startY) * eased);

      if (progress < 1) {
        scrollFrame = requestAnimationFrame(step);
      } else {
        window.scrollTo(0, endY);
        scrollFrame = 0;
        if (savedScrollBehavior !== null) {
          root.style.scrollBehavior = savedScrollBehavior;
          savedScrollBehavior = null;
        }
        updateActiveSection();
      }
    }

    scrollFrame = requestAnimationFrame(step);
  }

  function updateActiveSection() {
    if (!isHome) return;
    let current = null;
    const threshold = (topbar ? topbar.getBoundingClientRect().height : 0) + 72;

    for (const link of sectionLinks) {
      const target = document.getElementById(link.dataset.section);
      if (target && target.getBoundingClientRect().top <= threshold) current = link;
    }

    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
      current = sectionLinks[sectionLinks.length - 1] || current;
    }
    setActive(current, "location");
  }

  function scheduleActiveUpdate() {
    if (activeUpdateFrame) return;
    activeUpdateFrame = requestAnimationFrame(() => {
      activeUpdateFrame = 0;
      updateActiveSection();
    });
  }

  nav.addEventListener("click", event => {
    if (event.target.closest("a")) setMobileMenuOpen(false);
    const link = event.target.closest("a[data-section]");
    if (!link) return;

    const targetUrl = new URL(link.href, window.location.href);
    const sectionId = link.dataset.section;
    const samePageTarget = targetUrl.pathname === window.location.pathname
      ? document.getElementById(sectionId)
      : null;

    if (samePageTarget) {
      event.preventDefault();
      if (window.location.hash !== "#" + sectionId) {
        history.pushState(null, "", window.location.pathname + window.location.search + "#" + sectionId);
      }
      setActive(link, "location");
      animateTo(samePageTarget);
      return;
    }

    if (!isHome && targetUrl.pathname === homePath) {
      event.preventDefault();
      try {
        sessionStorage.setItem(PENDING_SECTION_KEY, sectionId);
        window.location.assign(homePath);
      } catch (_) {
        window.location.assign(targetUrl.href);
      }
    }
  });

  // User input cancels a running programmed scroll immediately.
  for (const eventName of ["wheel", "touchstart", "pointerdown"]) {
    window.addEventListener(eventName, stopAnimation, { passive: true });
  }
  window.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      stopAnimation();
    }
  });

  if (isHome) {
    window.addEventListener("scroll", scheduleActiveUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveUpdate, { passive: true });

    let pendingSection = null;
    try {
      pendingSection = sessionStorage.getItem(PENDING_SECTION_KEY);
      if (pendingSection) sessionStorage.removeItem(PENDING_SECTION_KEY);
    } catch (_) {}

    const requestedId = pendingSection || window.location.hash.slice(1);
    const requestedTarget = requestedId ? document.getElementById(requestedId) : null;

    if (requestedTarget && sectionLinks.some(link => link.dataset.section === requestedId)) {
      if (pendingSection) {
        history.replaceState(null, "", window.location.pathname + window.location.search + "#" + requestedId);
      }
      // Fragment navigation can jump before scripts run. Return to the top,
      // then animate to the requested section instead of leaving an instant jump.
      const initialBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
      root.style.scrollBehavior = initialBehavior;
      requestAnimationFrame(() => {
        const link = sectionLinks.find(item => item.dataset.section === requestedId);
        setActive(link, "location");
        animateTo(requestedTarget);
      });
    } else {
      updateActiveSection();
    }
  } else {
    const isFaqPage = /\/Frequently-Asked-Questions(?:-[^/]+)?\.html$/i.test(window.location.pathname);
    if (isFaqPage && faqLink) setActive(faqLink, "page");
  }
})();
