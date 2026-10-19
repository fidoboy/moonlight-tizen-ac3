(() => {
  "use strict";

  const RELEASE_API = "https://api.github.com/repos/fidoboy/moonlight-tizen-ac3/releases/latest";
  const FALLBACK_RELEASE = {
    tag_name: "v1.0.4",
    html_url: "https://github.com/fidoboy/moonlight-tizen-ac3/releases/tag/v1.0.4",
    published_at: "2026-10-18T03:09:05Z"
  };

  function localeForDate() {
    const language = (document.documentElement.lang || "en").toLowerCase();
    return language === "pt-br" ? "pt-BR" : language;
  }

  function init() {
    const link = document.getElementById("latest-release-link");
    const version = document.getElementById("latest-release-version");
    const date = document.getElementById("latest-release-date");
    if (!link || !version || !date) return;

    let publishedAt = FALLBACK_RELEASE.published_at;

    function renderDate() {
      date.textContent = new Intl.DateTimeFormat(localeForDate(), {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(new Date(publishedAt));
    }

    function renderRelease(release) {
      if (!release || !release.tag_name || !release.html_url || !release.published_at) return;
      version.textContent = release.tag_name;
      link.href = release.html_url;
      publishedAt = release.published_at;
      renderDate();
    }

    renderRelease(FALLBACK_RELEASE);

    // Keep the date localized when the homepage language is changed.
    const languageObserver = new MutationObserver(() => renderDate());
    languageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"]
    });

    // GitHub's /releases/latest endpoint returns the latest published stable release.
    fetch(RELEASE_API, { headers: { Accept: "application/vnd.github+json" } })
      .then(response => {
        if (!response.ok) throw new Error("GitHub Releases API returned " + response.status);
        return response.json();
      })
      .then(release => renderRelease(release))
      .catch(() => {
        // The static fallback remains visible if the API is unavailable.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
