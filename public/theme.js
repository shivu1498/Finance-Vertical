// Light/dark theme toggle. Light (the new default, modeled on an
// editorial equity-research library) has no attribute on <html>; dark
// (the previous black/cosmic theme) is applied via [data-theme="dark"].
// The actual tokens live in style.css; this just flips the attribute and
// remembers the choice. See index.html's early inline script for how the
// choice is applied before first paint, to avoid a flash of light theme
// for a returning dark-mode visitor.
(function () {
  function init() {
    const KEY = "stalkingstocks.theme";
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    function isDark() {
      return document.documentElement.dataset.theme === "dark";
    }
    function apply(dark) {
      if (dark) document.documentElement.dataset.theme = "dark";
      else delete document.documentElement.dataset.theme;
      btn.setAttribute("aria-pressed", String(dark));
      btn.title = dark ? "Switch to light theme" : "Switch to dark theme";
      btn.setAttribute("aria-label", btn.title);
    }

    apply(isDark()); // sync the button's label/state with whatever the head script already set

    btn.addEventListener("click", () => {
      const dark = !isDark();
      apply(dark);
      try {
        localStorage.setItem(KEY, dark ? "dark" : "light");
      } catch {
        // storage unavailable: the choice just won't persist across visits
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
