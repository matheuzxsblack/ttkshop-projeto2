(function () {
  var RENDER_API = "https://ttkshop-panelas-9e6w.onrender.com";
  var API_BASE = (function () {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") return "";
      if (h.endsWith(".onrender.com")) return "";
      /* Mesma origem — o servidor faz proxy pro Render se o pedido não estiver no disco local. */
      if (h === "ofertasgrandes.com" || h.endsWith(".ofertasgrandes.com")) return "";
      var fromCfg = String(window.TRACKING_API_BASE || window.TTK_RENDER_API || "").replace(/\/$/, "");
      if (fromCfg) return fromCfg;
      if (/\.vercel\.app$/.test(h)) return RENDER_API;
    } catch (e) {}
    return RENDER_API;
  })();

  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  var loading = document.getElementById("loading");
  var askCode = document.getElementById("ask-code");
  var result = document.getElementById("result");
  var currentCode = "";
  var lookupGen = 0;
  var bootCodeFromUrl = "";

  function showEl(el) {
    if (el) el.removeAttribute("hidden");
  }
  function hideEl(el) {
    if (el) el.setAttribute("hidden", "");
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    showEl(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { hideEl(toastEl); }, 3200);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function normalizeCode(raw) {
    return String(raw || "").replace(/\s+/g, "").trim().toUpperCase();
  }

  function findDemo(code) {
    var c = normalizeCode(code);
    if (!c || !window.DEMO_ORDER) return null;
    if (String(window.DEMO_ORDER.tracking_code || "").toUpperCase() === c) return window.DEMO_ORDER;
    return null;
  }

  function showAsk(title, text) {
    hideEl(loading);
    hideEl(result);
    showEl(askCode);
    if (title) {
      var t = document.getElementById("ask-title");
      if (t) t.textContent = title;
    }
    if (text) {
      var x = document.getElementById("ask-text");
      if (x) x.textContent = text;
    }
  }

  function renderTimeline(events) {
    var evs = events || [];
    var reached = evs.filter(function (e) { return e.reached; });
    if (!reached.length) reached = evs.filter(function (e) { return e.reached !== false; });
    if (!reached.length && evs.length) reached = [evs[0]];
    var lastAt = reached.length ? reached[reached.length - 1].at : "";
    var html = "";
    reached.slice().reverse().forEach(function (e) {
      var cls = e.at === lastAt ? "ev current" : "ev done";
      html +=
        '<div class="' + cls + '">' +
        '<p class="st">' + esc(e.status) + "</p>" +
        '<p class="dt">' + esc(fmtDateTime(e.at)) + "</p>" +
        '<p class="info">' + esc(e.detail) + "</p>" +
        "</div>";
    });
    var tl = document.getElementById("r-timeline");
    if (tl) tl.innerHTML = html;
  }

  function render(data) {
    if (!data) {
      showAsk("Erro", "Não foi possível exibir este pedido. Tente de novo.");
      return;
    }
    currentCode = data.tracking_code || "";
    var codeEl = document.getElementById("r-code");
    var nameEl = document.getElementById("r-name");
    var addrEl = document.getElementById("r-addr");
    if (codeEl) codeEl.textContent = currentCode || "—";
    if (nameEl) nameEl.textContent = data.client_name || "—";

    var a = data.address || {};
    if (addrEl) {
      var linhas = [];
      if (a.rua) linhas.push(a.rua + ", " + a.numero + (a.complemento ? ", " + a.complemento : ""));
      if (a.bairro || a.cidade) linhas.push((a.bairro ? a.bairro + " — " : "") + a.cidade + "/" + a.uf);
      if (a.cep) linhas.push("CEP " + a.cep);
      addrEl.innerHTML = linhas.map(esc).join("<br>") || "—";
    }

    renderTimeline(data.events || []);

    var items = data.items || [];
    var itemsCard = document.getElementById("items-card");
    var itemsEl = document.getElementById("r-items");
    if (itemsCard && itemsEl) {
      if (items.length) {
        showEl(itemsCard);
        itemsEl.innerHTML = items
          .map(function (it) {
            return '<div class="item-line"><span>' + esc(it.variante) + "</span><b>x" + esc(it.qtd) + "</b></div>";
          })
          .join("");
      } else {
        hideEl(itemsCard);
        itemsEl.innerHTML = "";
      }
    }

    hideEl(loading);
    hideEl(askCode);
    showEl(result);
  }

  function parseJsonResponse(body, status, cb) {
    var json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch (eParse) {
      return cb(new Error("invalid_json"));
    }
    if (status >= 200 && status < 300) return cb(null, json, status);
    cb(null, json, status);
  }

  function apiGetJsonFetch(url, timeoutMs, cb) {
    if (typeof fetch !== "function") return cb(new Error("no_fetch"));
    var finished = false;
    function done(err, data, status) {
      if (finished) return;
      finished = true;
      cb(err, data, status);
    }
    var timer = setTimeout(function () {
      done(new Error("timeout"));
    }, timeoutMs);
    fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
    })
      .then(function (resp) {
        return resp.text().then(function (text) {
          clearTimeout(timer);
          parseJsonResponse(text, resp.status, done);
        });
      })
      .catch(function () {
        clearTimeout(timer);
        done(new Error("network"));
      });
  }

  /** XHR — em WebViews cross-origin às vezes trava; preferir mesma origem + fetch fallback. */
  function apiGetJsonXhr(url, timeoutMs, cb) {
    timeoutMs = timeoutMs || 12000;
    var finished = false;
    function done(err, data, status) {
      if (finished) return;
      finished = true;
      cb(err, data, status);
    }
    try {
      var xhr = new XMLHttpRequest();
      var timer = setTimeout(function () {
        try { xhr.abort(); } catch (e) {}
        done(new Error("timeout"));
      }, timeoutMs);
      xhr.open("GET", url, true);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        clearTimeout(timer);
        parseJsonResponse(xhr.responseText || "", xhr.status, done);
      };
      xhr.onerror = function () {
        clearTimeout(timer);
        done(new Error("network"));
      };
      xhr.onabort = function () {
        clearTimeout(timer);
        done(new Error("timeout"));
      };
      xhr.send();
    } catch (e) {
      done(e);
    }
  }

  function apiGetJson(url, timeoutMs, cb) {
    timeoutMs = timeoutMs || 12000;
    apiGetJsonXhr(url, timeoutMs, function (err, data, status) {
      if (!err) return cb(null, data, status);
      apiGetJsonFetch(url, timeoutMs, cb);
    });
  }

  function isLoadingVisible() {
    return loading && !loading.hasAttribute("hidden");
  }

  function lookup(code, opts) {
    opts = opts || {};
    code = normalizeCode(code);
    if (!code) {
      showAsk();
      return;
    }
    var myGen = ++lookupGen;
    if (codeInput) codeInput.value = code;

    showEl(loading);
    hideEl(askCode);
    hideEl(result);

    var demo = findDemo(code);
    if (demo) {
      setTimeout(function () {
        if (myGen !== lookupGen) return;
        try { history.replaceState(null, "", "?c=" + encodeURIComponent(code)); } catch (e) {}
        render(demo);
      }, 350);
      return;
    }

    var url = (API_BASE || "") + "/api/rastreio/" + encodeURIComponent(code);
    var timeoutMs = opts.timeoutMs || 12000;
    apiGetJson(url, timeoutMs, function (err, data, status) {
      if (myGen !== lookupGen) return;
      if (err && API_BASE && (opts.retryLeft || 0) > 0) {
        var alt = RENDER_API + "/api/rastreio/" + encodeURIComponent(code);
        apiGetJson(alt, timeoutMs, function (err2, data2, status2) {
          if (myGen !== lookupGen) return;
          finishLookup(err2, data2, status2, code, opts, timeoutMs, myGen);
        });
        return;
      }
      finishLookup(err, data, status, code, opts, timeoutMs, myGen);
    });
  }

  function finishLookup(err, data, status, code, opts, timeoutMs, myGen) {
    if (myGen !== lookupGen) return;
    if (err && (opts.retryLeft || 0) > 0) {
      setTimeout(function () {
        lookup(code, {
          retryLeft: opts.retryLeft - 1,
          timeoutMs: Math.min(20000, timeoutMs + 4000),
          fromEmail: opts.fromEmail,
        });
      }, 800);
      return;
    }
    if (err) {
      showAsk(
        "Sem conexão",
        "Não foi possível consultar agora. O código já está no campo abaixo — toque em «Rastrear encomenda»."
      );
      return;
    }
    if (status < 200 || status >= 300) {
      showAsk(
        "Código não encontrado",
        (data && data.error) || "Confira o código informado no e-mail e tente novamente."
      );
      return;
    }
    try { history.replaceState(null, "", "?c=" + encodeURIComponent(code)); } catch (e) {}
    render(data);
  }

  function codeFromUrl() {
    try {
      var params = new URLSearchParams(location.search);
      var c = params.get("c") || params.get("codigo") || params.get("code") || "";
      c = normalizeCode(c);
      if (c) return c;
    } catch (e) {}
    var m = String(location.pathname || "").match(/\/c=([^/&?#]+)/i);
    if (m && m[1]) return normalizeCode(decodeURIComponent(m[1]));
    return "";
  }

  function startAutoLookup(code) {
    lookup(code, { retryLeft: 1, timeoutMs: 12000, fromEmail: true });
    var started = Date.now();
    var watchdog = setInterval(function () {
      if (!isLoadingVisible()) {
        clearInterval(watchdog);
        return;
      }
      if (Date.now() - started > 14000) {
        clearInterval(watchdog);
        lookupGen++;
        if (codeInput) codeInput.value = code;
        showAsk(
          "Demorou para carregar",
          "Toque em «Rastrear encomenda» abaixo. O código do e-mail já está preenchido."
        );
      }
    }, 500);
  }

  var btnGo = document.getElementById("btn-go");
  var codeInput = document.getElementById("code-input");
  var btnCopy = document.getElementById("btn-copy-code");

  if (btnGo && codeInput) {
    btnGo.addEventListener("click", function () {
      lookup(codeInput.value, { retryLeft: 1, timeoutMs: 14000 });
    });
    codeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") lookup(e.target.value, { retryLeft: 1, timeoutMs: 14000 });
    });
  }
  if (btnCopy) {
    btnCopy.addEventListener("click", function () {
      var text = currentCode || (document.getElementById("r-code") && document.getElementById("r-code").textContent) || "";
      if (!text || text === "—") return;
      function done() { showToast("Código copiado!"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(done);
      } else done();
    });
  }

  try {
    bootCodeFromUrl = codeFromUrl();
    if (bootCodeFromUrl) {
      if (codeInput) codeInput.value = bootCodeFromUrl;
      function bootFromPrefetchOrLookup() {
        if (window.__RASTREIO_PREFETCH__ && window.__RASTREIO_PREFETCH__.tracking_code) {
          try {
            history.replaceState(null, "", "?c=" + encodeURIComponent(bootCodeFromUrl));
          } catch (eH) {}
          render(window.__RASTREIO_PREFETCH__);
          return;
        }
        startAutoLookup(bootCodeFromUrl);
      }
      if (window.__RASTREIO_PREFETCH_DONE__) {
        bootFromPrefetchOrLookup();
      } else {
        var waited = 0;
        var prefIv = setInterval(function () {
          waited += 150;
          if (window.__RASTREIO_PREFETCH__ && window.__RASTREIO_PREFETCH__.tracking_code) {
            clearInterval(prefIv);
            bootFromPrefetchOrLookup();
          } else if (window.__RASTREIO_PREFETCH_DONE__ || waited > 11000) {
            clearInterval(prefIv);
            bootFromPrefetchOrLookup();
          }
        }, 150);
      }
    } else {
      hideEl(loading);
      showAsk();
    }
  } catch (bootErr) {
    hideEl(loading);
    showAsk("Erro ao carregar", "Atualize a página. Se persistir, digite o código manualmente abaixo.");
    console.error("[rastreio]", bootErr);
  }

  window.addEventListener("pageshow", function (ev) {
    if (!bootCodeFromUrl) return;
    if (ev.persisted && isLoadingVisible()) startAutoLookup(bootCodeFromUrl);
  });
})();
