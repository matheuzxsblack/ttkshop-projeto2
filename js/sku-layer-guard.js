/* WebViews (TikTok/e-mail) ignoram [hidden] e :has() — garante overlay não bloqueie a loja */
(function () {
  function layers() {
    var app = document.getElementById("app");
    var ov = document.getElementById("sku-overlay");
    var sh = document.getElementById("sku-sheet");
    if (!ov || !sh) return;
    var open = !sh.hasAttribute("hidden");
    if (app) app.classList.toggle("sku-open", open);
    if (open) {
      ov.removeAttribute("hidden");
      ov.style.pointerEvents = "";
      ov.style.display = "";
    } else {
      ov.setAttribute("hidden", "");
      ov.style.pointerEvents = "none";
      ov.style.display = "none";
    }
  }

  function run() {
    try {
      layers();
    } catch (e) {}
  }

  run();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  }
  window.addEventListener("pageshow", run);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") run();
  });
  setInterval(run, 2500);
})();
