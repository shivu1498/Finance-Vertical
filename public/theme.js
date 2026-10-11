// Color theme switcher: a swatch button in the topbar opens a menu of
// named themes. "" (Light · Library) is the default and has no attribute
// on <html>; the other three are applied via data-theme. All four themes'
// actual color tokens live in style.css (the :root blocks at the top);
// this file only flips the attribute, remembers the choice, and drives
// the dropdown's open/close/selection behavior.
(function () {
  const VALID = new Set(["", "dark", "matte", "trypan"]);
  const KEY = "stalkingstocks.theme";

  function init() {
    const wrap = document.querySelector(".theme-switcher");
    const toggle = document.getElementById("theme-toggle");
    const menu = document.getElementById("theme-menu");
    if (!wrap || !toggle || !menu) return;

    function current() {
      const v = document.documentElement.dataset.theme || "";
      return VALID.has(v) ? v : "";
    }
    function markActive() {
      const v = current();
      for (const opt of menu.querySelectorAll(".theme-option")) {
        opt.classList.toggle("on", opt.dataset.themeValue === v);
      }
    }
    function apply(value) {
      if (value) document.documentElement.dataset.theme = value;
      else delete document.documentElement.dataset.theme;
      markActive();
    }
    function closeMenu() {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
    function openMenu() {
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      menu.querySelector(".theme-option.on")?.focus({ preventScroll: true });
    }

    apply(current()); // sync the swatch/menu state with whatever the head script already set

    toggle.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));

    menu.addEventListener("click", (e) => {
      const opt = e.target.closest(".theme-option");
      if (!opt) return;
      const value = opt.dataset.themeValue;
      apply(value);
      try {
        localStorage.setItem(KEY, value);
      } catch {
        // storage unavailable: the choice just won't persist across visits
      }
      closeMenu();
      toggle.focus();
    });

    document.addEventListener("click", (e) => {
      if (!menu.hidden && !e.target.closest(".theme-switcher")) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) {
        closeMenu();
        toggle.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
