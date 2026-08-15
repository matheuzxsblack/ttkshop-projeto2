    (function () {
      var TOKEN_KEY = "admin_token";
      var ROLE_KEY = "admin_role";
      /* No Vercel o admin.html é estático — API/webhook ficam no achadofertas. */
      var API_BASE = (function () {
        try {
          var h = String(location.hostname || "").toLowerCase();
          if (h === "localhost" || h === "127.0.0.1") return "";
          if (h.endsWith(".onrender.com")) return "";
          var fromCfg = String((window.TTK_RENDER_API || "")).replace(/\/$/, "");
          if (fromCfg) return fromCfg;
          if (/\.vercel\.app$/.test(h)) return "https://ttkshop-panelas-9e6w.onrender.com";
        } catch (e) {}
        return "";
      })();
      var _fetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        if (typeof input === "string" && input.charAt(0) === "/" && API_BASE) {
          input = API_BASE + input;
        }
        return _fetch(input, init);
      };
      var _ES = window.EventSource;
      window.EventSource = function (url, opts) {
        if (typeof url === "string" && url.charAt(0) === "/" && API_BASE) {
          url = API_BASE + url;
        }
        return new _ES(url, opts);
      };
      var loginScreen = document.getElementById("login-screen");
      var panel = document.getElementById("panel");
      var pixelSection = document.getElementById("pixel-section");
      var loginErr = document.getElementById("login-err");
      var btnLogin = document.getElementById("btn-login");
      var refreshTimer = null;
      var lastRange = null;
      var pixelStoreCache = {};

      function money(cents) {
        return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      }

      function token() {
        return localStorage.getItem(TOKEN_KEY) || "";
      }

      function role() {
        return localStorage.getItem(ROLE_KEY) || "admin";
      }

      function setRole(r) {
        localStorage.setItem(ROLE_KEY, r === "pixel" ? "pixel" : "admin");
      }

      function authHeaders(extra) {
        var h = Object.assign({ Authorization: "Bearer " + token() }, extra || {});
        return h;
      }

      function fetchJson(url, init) {
        return fetch(url, init).then(function (r) {
          return r.text().then(function (t) {
            var j = {};
            try {
              j = t ? JSON.parse(t) : {};
            } catch (eParse) {
              j = {
                error:
                  (r.status === 404 ? "API desatualizada no Render (faça deploy do server.js)." : null) ||
                  (t && t.length < 120 ? t : "Resposta inválida do servidor"),
              };
            }
            return { ok: r.ok, status: r.status, j: j };
          });
        });
      }

      function goPage(name) {
        currentPageName = name || "overview";
        document.querySelectorAll(".side-link").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-page") === name);
        });
        document.querySelectorAll(".page").forEach(function (p) {
          p.classList.toggle("active", p.id === "page-" + name);
        });
        var titles = {
          overview: "Visão geral",
          funnel: "Funil / Logs",
          sales: "Vendas PIX",
          stores: "Lojas",
          emails: "E-mails",
          checkout: "Checkout",
          gateway: "Gateway PIX",
          pixels: "Pixels",
          roi: "ROI",
          performance: "Performance",
          reconcile: "Reconciliação",
          cloakerpro: "Cloaker Pro",
        };
        var el = document.getElementById("page-title");
        if (el) el.textContent = titles[name] || "Admin";
        document.body.classList.remove("sidebar-open");
        if (name === "reconcile") loadReconcile();
        if (name === "roi") loadRoi();
        if (name === "performance") loadPerformance();
        if (name === "checkout") {
          loadCheckoutModes();
        }
        if (name === "gateway") loadPaymentGatewayAdmin();
        if (name === "funnel") {
          loadFunnel();
          startFunnelRefresh();
        } else {
          stopFunnelRefresh();
        }
        if (name === "sales") loadTransactions(true);
      }

      var currentPageName = "overview";
      var txListOffset = 0;
      var txListHasMore = false;
      var lastRecent = [];
      var lastRecentById = Object.create(null);

      var funnelRefreshTimer = null;
      var lastFunnelPayload = null;

      function funnelProductNameMap() {
        var m = Object.create(null);
        var stores = (lastFunnelPayload && lastFunnelPayload.stores) || [];
        stores.forEach(function (s) {
          if (s && s.key) m[String(s.key)] = s.label || s.key;
        });
        return m;
      }

      function funnelProductsCellHtml(productsObj) {
        var map = funnelProductNameMap();
        var keys = Object.keys(productsObj || {});
        if (!keys.length) return "—";
        return keys
          .map(function (pid) {
            var raw = map[pid] || pid;
            var name = escapeHtml(String(raw));
            var n = Number(productsObj[pid]) || 1;
            if (n > 1) name += ' <span style="color:var(--muted)">(×' + n + ")</span>";
            return name;
          })
          .join("<br>");
      }

      function renderFunnelProductVisitors() {
        var tbody = document.getElementById("funnel-product-visitors-body");
        if (!tbody) return;
        var rows = (lastFunnelPayload && lastFunnelPayload.product_visitors) || [];
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="5">Ninguém interagiu com produto neste período</td></tr>';
          return;
        }
        tbody.innerHTML = rows
          .map(function (row) {
            var dt = row.last ? new Date(row.last) : null;
            var when = dt
              ? dt.toLocaleDateString("pt-BR") +
                " " +
                dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              : "—";
            var loja = escapeHtml(row.store_label || row.store || "—");
            var host = escapeHtml(row.host || "—");
            var prods = funnelProductsCellHtml(row.products);
            var label = escapeHtml(row.label || row.outcome || "—");
            return (
              "<tr><td>" +
              when +
              "</td><td>" +
              loja +
              "</td><td>" +
              host +
              '</td><td class="funnel-prod-cell">' +
              prods +
              "</td><td>" +
              label +
              "</td></tr>"
            );
          })
          .join("");
      }

      function stopFunnelRefresh() {
        if (funnelRefreshTimer) {
          clearInterval(funnelRefreshTimer);
          funnelRefreshTimer = null;
        }
      }

      function startFunnelRefresh() {
        stopFunnelRefresh();
        funnelRefreshTimer = setInterval(function () {
          try {
            loadFunnel();
          } catch (eF) {
            console.error(eF);
          }
        }, 30000);
      }

      function renderFunnelOutcomeSummary(st) {
        var tbody = document.getElementById("funnel-outcome-body");
        if (!tbody) return;
        var total = Number(st.sessions) || 0;
        var rows = [
          { label: "Só entrou e saiu", n: st.bounce },
          { label: "Viu produto, não foi ao checkout", n: st.product_only },
          { label: "Foi ao checkout, não gerou Pix", n: st.checkout_abandon },
          { label: "Gerou Pix, não pagou", n: st.pix_abandon },
          { label: "Concluiu pagamento", n: st.success },
        ];
        function pct(n) {
          if (!total) return "—";
          return Math.round((Number(n || 0) / total) * 100) + "%";
        }
        tbody.innerHTML = rows
          .map(function (row) {
            return (
              "<tr><td>" +
              escapeHtml(row.label) +
              "</td><td><strong>" +
              String(row.n != null ? row.n : 0) +
              "</strong></td><td>" +
              pct(row.n) +
              "</td></tr>"
            );
          })
          .join("");
      }

      function renderFunnelHostSummary(st) {
        var tbody = document.getElementById("funnel-host-body");
        if (!tbody) return;
        var list = (st && st.by_host_list) || [];
        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="5">Sem visitas no período</td></tr>';
          return;
        }
        tbody.innerHTML = list
          .slice(0, 15)
          .map(function (row) {
            return (
              "<tr><td>" +
              escapeHtml(row.host || "—") +
              "</td><td>" +
              String(row.sessions || 0) +
              "</td><td>" +
              String(row.product || 0) +
              "</td><td>" +
              String(row.checkout || 0) +
              "</td><td>" +
              String(row.success || 0) +
              "</td></tr>"
            );
          })
          .join("");
      }

      function renderFunnelByStore(d) {
        var panel = document.getElementById("funnel-by-store-panel");
        if (!panel) return;
        var isAll = !d || d.store === "all";
        panel.hidden = !isAll;
        if (!isAll) return;
        var list = (d && d.by_store) || [];
        if (!list.length) {
          panel.innerHTML = '<div style="padding:10px 4px;color:var(--muted);font-size:13px">Sem visitas no período</div>';
          return;
        }
        panel.innerHTML = list
          .map(function (row) {
            var n = row.sessions != null ? row.sessions : 0;
            return (
              '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px;flex-wrap:wrap">' +
              '<span style="color:var(--text);font-weight:600">' + escapeHtml(row.label || row.key || "—") + "</span>" +
              '<span style="color:var(--muted)"><b style="color:var(--ok)">' + String(n) + "</b> visitante(s) · " + String(row.product != null ? row.product : 0) + " viram produto · " + String(row.success != null ? row.success : 0) + " pagaram</span></div>"
            );
          })
          .join("");
      }

      /* ---------- Funil novo: etapas com barras (Pago = gateway TX status paid, floor via funnelTxFloorAgg no server) ---------- */
      function renderFunnelSteps(st) {
        var box = document.getElementById("funnel-steps");
        if (!box) return;
        var steps = [
          { label: "Produto", sub: "entrada de tráfego", v: st.product, g: ["#38bdf8", "#2563eb"] },
          { label: "Escolhendo variante", sub: null, v: st.variant != null ? st.variant : st.product, g: ["#8b5cf6", "#6d28d9"] },
          { label: "Adicionou ao carrinho", sub: null, v: st.cart != null ? st.cart : st.checkout, g: ["#fbbf24", "#d97706"] },
          { label: "Checkout", sub: null, v: st.checkout, g: ["#ec4899", "#be185d"] },
          { label: "Tela Pix", sub: null, v: st.pix, g: ["#34d399", "#059669"] },
          { label: "Pago (gateway)", sub: null, v: st.success, g: ["#2dd4bf", "#0d9488"] },
        ];
        var first = Number(steps[0].v) || 0;
        var prev = null;
        box.innerHTML = steps
          .map(function (s2, i) {
            var v = Number(s2.v) || 0;
            var pctFirst = first > 0 ? Math.max(2, Math.round((v / first) * 100)) : 2;
            var pctPrev = i === 0 ? 100 : prev > 0 ? Math.round((v / prev) * 100) : 0;
            prev = v;
            var sub = s2.sub != null ? s2.sub : pctPrev + "% da etapa anterior";
            return (
              '<div class="fstep">' +
              '<div class="fstep-top">' +
              '<div class="fstep-label"><b>' + s2.label + "</b><span>" + sub + "</span></div>" +
              '<div class="fstep-value">' + String(v) + "</div>" +
              "</div>" +
              '<div class="fstep-track"><div class="fstep-fill" style="width:0%;background:linear-gradient(90deg,' + s2.g[0] + "," + s2.g[1] + ')" data-w="' + pctFirst + '"></div></div>' +
              "</div>"
            );
          })
          .join("");
        setTimeout(function () {
          box.querySelectorAll(".fstep-fill").forEach(function (f) {
            f.style.width = f.getAttribute("data-w") + "%";
          });
        }, 30);
      }

      function renderFunnelStrip(st) {
        var el = document.getElementById("funnel-strip");
        if (!el) return;
        var p = Number(st.product) || 0;
        var c = Number(st.checkout) || 0;
        var g = Number(st.pix) || 0;
        var v = Number(st.success) || 0;
        var x = p > 0 ? Math.round((c / p) * 100) : 0;
        var y = p > 0 ? Math.round((g / p) * 100) : 0;
        var z = g > 0 ? Math.round((v / g) * 100) : 0;
        el.innerHTML =
          "<b>" + p + "</b> viram o produto · <b>" + c + "</b> no checkout (" + x + "%) · <b>" + g + "</b> geraram Pix (" + y + "%) · <b>" + v + "</b> pagaram · conversão Pix→pago " + z + "%";
      }

      function loadFunnel() {
        var daysEl = document.getElementById("funnel-days");
        var storeEl = document.getElementById("funnel-store");
        var days = daysEl ? parseInt(daysEl.value, 10) || 7 : 7;
        var store = storeEl ? storeEl.value || "all" : "all";
        var outcomeBody = document.getElementById("funnel-outcome-body");
        var hostBody = document.getElementById("funnel-host-body");
        if (outcomeBody) outcomeBody.innerHTML = "<tr><td colspan=\"3\">Carregando…</td></tr>";
        if (hostBody) hostBody.innerHTML = "<tr><td colspan=\"5\">Carregando…</td></tr>";
        fetch(
          "/api/admin/funnel?days=" +
            encodeURIComponent(days) +
            "&store=" +
            encodeURIComponent(store),
          { headers: authHeaders() }
        )
          .then(function (r) {
            if (r.status === 401) {
              showLogin(true);
              throw new Error("expired");
            }
            return r.json();
          })
          .then(function (d) {
            lastFunnelPayload = d;
            var st = (d && d.stats) || {};
            function set(id, v) {
              var el = document.getElementById(id);
              if (el) el.textContent = String(v != null ? v : 0);
            }
            set("fn-sessions", st.sessions);
            set("fn-product", st.product);
            set("fn-checkout", st.checkout);
            set("fn-pix", st.pix);
            set("fn-success", st.success);
            set("fn-bounce", st.bounce);
            set("fn-product-only", st.product_only);
            set("fn-co-abandon", st.checkout_abandon);
            set("fn-pix-abandon", st.pix_abandon);
            set("fn-cloak-hit", st.cloak_hit);
            set("fn-cloak-pass", st.cloak_pass);
            renderFunnelSteps(st);
            renderFunnelStrip(st);
            renderFunnelByStore(d);
            renderFunnelOutcomeSummary(st);
            renderFunnelHostSummary(st);
            var pvPanel = document.getElementById("funnel-product-visitors-panel");
            if (pvPanel && !pvPanel.hidden) renderFunnelProductVisitors();
          })
          .catch(function (err) {
            if (err && err.message === "expired") return;
            if (outcomeBody) {
              outcomeBody.innerHTML = "<tr><td colspan=\"3\">Erro ao carregar. Tente Atualizar.</td></tr>";
            }
            if (hostBody) {
              hostBody.innerHTML = "<tr><td colspan=\"5\">Erro ao carregar.</td></tr>";
            }
          });
      }

      function applyPixelVisibility() {
        /* igual ofertasdetudo: admin também vê/gerencia pixels */
        var navPx = document.getElementById("nav-pixels");
        if (navPx) navPx.hidden = false;
        if (pixelSection) pixelSection.hidden = false;
      }

      document.getElementById("side-nav").addEventListener("click", function (e) {
        var btn = e.target.closest(".side-link");
        if (!btn || btn.hidden) return;
        goPage(btn.getAttribute("data-page"));
      });
      var btnMenu = document.getElementById("btn-menu");
      if (btnMenu) {
        btnMenu.addEventListener("click", function () {
          document.body.classList.toggle("sidebar-open");
        });
      }
      var sideBg = document.getElementById("side-backdrop");
      if (sideBg) {
        sideBg.addEventListener("click", function () {
          document.body.classList.remove("sidebar-open");
        });
      }

      /* clearToken=false: só mostra tela, não apaga localStorage (evita deslogar no F5) */
      function showLogin(clearToken) {
        clearInterval(refreshTimer);
        if (clearToken) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ROLE_KEY);
        }
        panel.classList.remove("show");
        panel.hidden = true;
        loginScreen.hidden = false;
      }

      function tryAutoIp() {
        fetch("/api/admin/auto")
          .then(function (r) {
            if (!r.ok) throw new Error("no-auto");
            return r.json();
          })
          .then(function (j) {
            if (j.token) {
              localStorage.setItem(TOKEN_KEY, j.token);
              setRole(j.role || "admin");
              showPanel();
            } else {
              showLogin(false);
            }
          })
          .catch(function () {
            showLogin(false);
          });
      }

      function showPanel() {
        loginScreen.hidden = true;
        panel.hidden = false;
        panel.classList.add("show");
        goPage("overview");
        applyPixelVisibility();
        loadStats();
        loadCheckoutModes();
        loadPixelConfig();
        clearInterval(refreshTimer);
        refreshTimer = setInterval(function () {
          loadStats();
          if (currentPageName === "sales") loadTransactions(true);
        }, 15000);
        connectOnlineSSE();
      }

      /* boot: se tem token salvo, entra direto — valida role em background */
      function bootSession() {
        if (token()) {
          showPanel();
          fetch("/api/admin/me", { headers: authHeaders() })
            .then(function (r) {
              if (!r.ok) throw new Error("bad");
              return r.json();
            })
            .then(function (j) {
              setRole(j.role || "admin");
              applyPixelVisibility();
              loadPixelConfig();
            })
            .catch(function () {
              return fetch("/api/admin/auto")
                .then(function (r2) {
                  if (!r2.ok) throw new Error("no");
                  return r2.json();
                })
                .then(function (j) {
                  if (j.token) {
                    localStorage.setItem(TOKEN_KEY, j.token);
                    setRole(j.role || "admin");
                    showPanel();
                  } else {
                    showLogin(true);
                  }
                })
                .catch(function () {
                  /* rede falhou — mantém painel */
                });
            });
          return;
        }
        tryAutoIp();
      }

      /* ---------- gateway PIX (admin) ---------- */
      var gwState = null;

      function gwStatus(msg, cls) {
        var el = document.getElementById("gw-status");
        if (!el) return;
        el.textContent = msg || "";
        el.className = "pixel-status" + (cls ? " " + cls : "");
      }

      function renderPaymentGatewayOptions() {
        var list = document.getElementById("gw-options");
        var badge = document.getElementById("gw-active-badge");
        if (!list || !gwState) return;
        var active = gwState.active || "";
        var src = gwState.source || "";
        var srcLbl =
          src === "admin"
            ? "painel"
            : src === "env"
              ? "env Render"
              : "automático";
        if (badge) {
          badge.textContent =
            (gwState.options || [])
              .filter(function (o) { return o.id === active; })
              .map(function (o) { return o.label; })[0] || active || "—";
          badge.textContent += " · " + srcLbl;
        }
        list.innerHTML = (gwState.options || [])
          .map(function (o) {
            var isActive = o.id === active;
            var cfgTag = o.configured
              ? '<span class="gw-tag ok">API no Render</span>'
              : '<span class="gw-tag warn">sem chave no Render</span>';
            var liveTag = isActive ? '<span class="gw-tag live">ATIVO AGORA</span>' : "";
            return (
              '<div class="gw-option' + (isActive ? " active" : "") + '" data-gw="' + o.id + '">' +
              "<strong>" + escapeHtml(o.label) + "</strong>" +
              cfgTag +
              liveTag +
              '<button class="ck-btn' + (isActive ? " active" : "") + '" type="button" data-gw-use="' + o.id + '"' +
              (isActive ? " disabled" : "") + ">" +
              (isActive ? "Em uso" : "Usar este gateway") +
              "</button></div>"
            );
          })
          .join("");
      }

      function loadPaymentGatewayAdmin() {
        gwStatus("Carregando…");
        fetch("/api/admin/payment-gateway", { headers: authHeaders() })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            if (!res.ok) {
              gwStatus(res.j.error || "Falha ao carregar gateway.", "err");
              return;
            }
            gwState = res.j;
            renderPaymentGatewayOptions();
            var extra = "";
            if (gwState.updatedAt) {
              extra = " Última troca: " + new Date(gwState.updatedAt).toLocaleString("pt-BR") + ".";
            }
            gwStatus(
              "Novos Pix usam o gateway marcado como ATIVO." + extra + " Troca imediata no servidor.",
              "ok"
            );
          })
          .catch(function () {
            gwStatus("Servidor indisponível.", "err");
          });
      }

      document.getElementById("gw-options").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-gw-use]");
        if (!btn || btn.disabled) return;
        var gw = btn.getAttribute("data-gw-use");
        if (!gw) return;
        gwStatus("Trocando gateway…");
        fetch("/api/admin/payment-gateway", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify({ gateway: gw }),
        })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            if (!res.ok) {
              gwStatus(res.j.error || "Falha ao trocar gateway.", "err");
              return;
            }
            gwState = Object.assign({}, gwState || {}, {
              active: res.j.active,
              source: "admin",
              adminSelection: res.j.gateway,
              updatedAt: new Date().toISOString(),
            });
            renderPaymentGatewayOptions();
            var ghNote =
              res.j.persisted && res.j.persisted.github
                ? " Salvo no GitHub (sobrevive redeploy)."
                : "";
            var warn = res.j.warn ? " " + res.j.warn : "";
            gwStatus(
              (res.j.label || gw) + " ativo para novos Pix." + ghNote + warn,
              res.j.warn ? "err" : "ok"
            );
            adminToast((res.j.label || gw) + " — gateway PIX ativo");
          })
          .catch(function () {
            gwStatus("Servidor indisponível.", "err");
          });
      });

      /* ---------- troca de checkout (tiktok original ⇄ simples) ---------- */
      var ckModes = {};

      function ckStatus(msg, cls) {
        var el = document.getElementById("ck-status");
        el.textContent = msg || "";
        el.className = "pixel-status" + (cls ? " " + cls : "");
      }

      function renderCheckoutList() {
        var list = document.getElementById("ck-list");
        list.innerHTML = Object.keys(ckModes)
          .map(function (key) {
            var s = ckModes[key];
            if (!s.supportsSimple) return "";
            var isSimple = s.mode === "simple";
            return (
              '<div class="ck-row" data-store="' + key + '">' +
              "<strong>" + s.label + "</strong>" +
              '<span class="ck-mode-tag' + (isSimple ? " simple" : "") + '">' +
              (isSimple ? "SIMPLES ATIVO" : "COMPLETO ATIVO") + "</span>" +
              '<button class="ck-btn' + (!isSimple ? " active" : "") + '" type="button" data-mode="tiktok">Checkout completo (original)</button>' +
              '<button class="ck-btn' + (isSimple ? " active" : "") + '" type="button" data-mode="simple">Usar checkout Simples</button>' +
              "</div>"
            );
          })
          .join("");
      }

      function loadCheckoutModes() {
        fetch("/api/admin/checkout-mode", { headers: authHeaders() })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            if (!res.ok) {
              ckStatus(res.j.error || "Falha ao carregar o checkout.", "err");
              return;
            }
            ckModes = res.j.stores || {};
            renderCheckoutList();
            ckStatus("O checkout simples já mostra o endereço na tela e o Pix logo em seguida — ideal para clientes com mais idade.");
          })
          .catch(function () {
            ckStatus("Servidor indisponível.", "err");
          });
      }

      document.getElementById("ck-list").addEventListener("click", function (e) {
        var btn = e.target.closest(".ck-btn");
        if (!btn || btn.classList.contains("active")) return;
        var row = btn.closest(".ck-row");
        var store = row.getAttribute("data-store");
        var mode = btn.getAttribute("data-mode");
        btn.disabled = true;
        ckStatus("Trocando checkout…");
        fetch("/api/admin/checkout-mode", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ store: store, mode: mode }),
        })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            btn.disabled = false;
            if (!res.ok) {
              ckStatus(res.j.error || "Falha ao trocar o checkout.", "err");
              return;
            }
            if (ckModes[store]) ckModes[store].mode = res.j.mode;
            renderCheckoutList();
            var lbl = (ckModes[store] && ckModes[store].label) || store;
            var ghNote =
              res.j.persisted && res.j.persisted.github === false && res.j.persisted.github_error
                ? " Aviso: não gravou no GitHub (" + res.j.persisted.github_error + ")."
                : "";
            ckStatus(
              lbl + " agora usa o checkout " + (res.j.mode === "simple" ? "SIMPLES" : "completo (multi-etapas)") + ". Vale para os próximos acessos (quem já está no site precisa recarregar)." + ghNote,
              ghNote ? "err" : "ok"
            );
            adminToast("Checkout de " + lbl + " atualizado!");
          })
          .catch(function () {
            btn.disabled = false;
            ckStatus("Servidor indisponível.", "err");
          });
      });

      /* ---------- cloaker (/bbj, /rp, /tdd) ---------- */
      var cloakStores = {};

      function cloakStatus(msg, cls) {
        var el = document.getElementById("cloak-status");
        if (!el) return;
        el.textContent = msg || "";
        el.className = "pixel-status" + (cls ? " " + cls : "");
      }

      function renderCloakList() {
        var list = document.getElementById("cloak-list");
        if (!list) return;
        list.innerHTML = Object.keys(cloakStores)
          .map(function (key) {
            var s = cloakStores[key];
            var on = !!s.enabled;
            return (
              '<div class="ck-row" data-cloak-store="' + key + '">' +
              "<strong>" + s.label + "</strong>" +
              '<code style="font-size:12px;color:var(--muted)">' + s.entryPath + "</code>" +
              '<span class="ck-mode-tag ' + (on ? "cloak-on" : "cloak-off") + '">' +
              (on ? "CLOAKER ATIVO" : "CLOAKER OFF") + "</span>" +
              '<button class="ck-btn' + (on ? " active" : "") + '" type="button" data-cloak="1">Ativar cloaker</button>' +
              '<button class="ck-btn' + (!on ? " active" : "") + '" type="button" data-cloak="0">Desativar</button>' +
              "</div>"
            );
          })
          .join("");
      }

      function loadCloakerModes() {
        if (!document.getElementById("cloak-list")) return;
        fetchJson("/api/admin/cloaker-mode", { headers: authHeaders() })
          .then(function (res) {
            if (!res.ok) {
              cloakStatus(res.j.error || "Falha ao carregar cloaker.", "err");
              return;
            }
            cloakStores = res.j.stores || {};
            renderCloakList();
            cloakStatus("Com cloaker ativo, só celular real passa na URL de anúncio; demais vão para /compra.");
          })
          .catch(function () {
            cloakStatus("Servidor indisponível (Render offline ou rede).", "err");
          });
      }

      (document.getElementById("cloak-list") || { addEventListener: function () {} }).addEventListener("click", function (e) {
        var btn = e.target.closest(".ck-btn");
        if (!btn || btn.classList.contains("active")) return;
        var row = btn.closest(".ck-row");
        var store = row.getAttribute("data-cloak-store");
        var enabled = btn.getAttribute("data-cloak") === "1";
        btn.disabled = true;
        cloakStatus("Salvando cloaker…");
        fetch("/api/admin/cloaker-mode", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ store: store, enabled: enabled }),
        })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            btn.disabled = false;
            if (!res.ok) {
              cloakStatus(res.j.error || "Falha ao salvar.", "err");
              return;
            }
            if (cloakStores[store]) cloakStores[store].enabled = !!res.j.enabled;
            renderCloakList();
            var ghNote =
              res.j.persisted && res.j.persisted.github === false && res.j.persisted.github_error
                ? " Aviso: não gravou no GitHub (" + res.j.persisted.github_error + ")."
                : "";
            cloakStatus(
              (cloakStores[store] && cloakStores[store].label) + ": cloaker " + (res.j.enabled ? "ATIVO" : "desativado") + "." + ghNote,
              ghNote ? "err" : "ok"
            );
            adminToast("Cloaker atualizado!");
          })
          .catch(function () {
            btn.disabled = false;
            cloakStatus("Servidor indisponível.", "err");
          });
      });

      /* ---------- e-mail do pedido (verificação + envio) ---------- */
      var emManual = document.getElementById("em-manual");
      var emBtn = document.getElementById("btn-em-send");
      var emBtnManual = document.getElementById("btn-em-send-manual");

      function emStatus(msg, cls) {
        var el = document.getElementById("em-status");
        el.textContent = msg || "";
        el.className = "pixel-status" + (cls ? " " + cls : "");
      }

      function emVal(id) {
        return document.getElementById(id).value.trim();
      }

      function emValidEmail(e) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").toLowerCase());
      }

      function emSend(payload, btn) {
        btn.disabled = true;
        fetch("/api/admin/email-send", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            btn.disabled = false;
            if (!res.ok) {
              if (res.j.need_manual) {
                emManual.hidden = false;
                emStatus("Este e-mail nunca comprou aqui — preencha os dados abaixo para enviar.", "err");
                return;
              }
              emStatus(res.j.error || "Falha ao enviar o e-mail.", "err");
              return;
            }
            emManual.hidden = true;
            if (res.j.kind === "reminder") {
              emStatus(
                "Lembrete enviado (Pix AINDA PENDENTE) para " + res.j.sent_to +
                " · " + res.j.reminder_kind + " min" +
                (res.j.x1 ? " · X1 marcado" : "") +
                " · " + money(res.j.amount || 0),
                "ok"
              );
              adminToast("Lembrete enviado — Pix ainda não pago");
            } else {
              var hintSpam =
                " Confira spam/lixo e aguarde ~2 min. Remetente: pedidos@ofertasgrandes.com";
              emStatus(
                "Confirmação enviada para " + res.j.sent_to +
                " · rastreio " + (res.j.tracking_code || "") +
                (res.j.tracking_link ? " · " + res.j.tracking_link : "") +
                (res.j.tracking_ok === false ? " · AVISO: código não persistiu — reenvie" : "") +
                hintSpam,
                res.j.tracking_ok === false ? "err" : "ok"
              );
              adminToast(
                res.j.tracking_ok === false
                  ? "E-mail enviado mas rastreio falhou — reenvie"
                  : "E-mail enviado (veja spam se não chegar)"
              );
            }
          })
          .catch(function () {
            btn.disabled = false;
            emStatus("Servidor indisponível.", "err");
          });
      }

      emBtn.addEventListener("click", function () {
        var email = emVal("em-email").toLowerCase();
        if (!emValidEmail(email)) {
          emStatus("Digite um e-mail válido.", "err");
          return;
        }
        emBtn.disabled = true;
        emStatus("Verificando se este e-mail já comprou…");
        fetch("/api/admin/email-lookup", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ email: email }),
        })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            emBtn.disabled = false;
            if (!res.ok) {
              emStatus(res.j.error || "Falha na verificação.", "err");
              return;
            }
            if (!res.j.found) {
              emManual.hidden = false;
              emStatus("Este e-mail nunca comprou aqui — preencha os dados abaixo para enviar.", "err");
              return;
            }
            var o = res.j.order;
            var itens = (o.items || [])
              .map(function (it) { return it.qtd + "x " + it.variante; })
              .join(" · ");
            emManual.hidden = true;
            var stLabel = o.status === "paid" ? "PAGO" : "PENDENTE (não pago)";
            emStatus(
              "Pedido encontrado (" + stLabel + "): " + o.client_name + " — " + money(o.amount) +
              (itens ? " — " + itens : "") +
              (o.status === "paid"
                ? ". Enviando confirmação de pagamento…"
                : ". Enviando lembrete — NÃO vai dizer que pagou…")
            );
            emSend({ email: email }, emBtn);
          })
          .catch(function () {
            emBtn.disabled = false;
            emStatus("Servidor indisponível.", "err");
          });
      });

      emBtnManual.addEventListener("click", function () {
        var email = emVal("em-email").toLowerCase();
        if (!emValidEmail(email)) {
          emStatus("Digite um e-mail válido no campo de cima.", "err");
          return;
        }
        if (!emVal("em-nome") || !emVal("em-produto")) {
          emStatus("Preencha pelo menos o nome e o produto comprado.", "err");
          return;
        }
        emStatus("Enviando e-mail com os dados preenchidos…");
        emSend(
          {
            email: email,
            manual: {
              nome: emVal("em-nome"),
              cpf: emVal("em-cpf"),
              fone: emVal("em-fone"),
              produto: emVal("em-produto"),
              qtd: emVal("em-qtd"),
              valor: emVal("em-valor"),
              cep: emVal("em-cep"),
              rua: emVal("em-rua"),
              numero: emVal("em-numero"),
              compl: emVal("em-compl"),
              bairro: emVal("em-bairro"),
              cidade: emVal("em-cidade"),
              uf: emVal("em-uf"),
            },
          },
          emBtnManual
        );
      });


      function emSendReminder(kind) {
        var email = emVal("em-email").toLowerCase();
        if (!emValidEmail(email)) {
          emStatus("Digite um e-mail válido.", "err");
          return;
        }
        var btn = kind === 30
          ? document.getElementById("btn-em-remind-30")
          : document.getElementById("btn-em-remind-5");
        btn.disabled = true;
        emStatus("Enviando lembrete de " + kind + " minutos…");
        fetch("/api/admin/email-reminder", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ email: email, kind: kind }),
        })
          .then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
          })
          .then(function (res) {
            btn.disabled = false;
            if (!res.ok) {
              emStatus(res.j.error || "Falha ao enviar o lembrete.", "err");
              return;
            }
            emStatus(
              "Lembrete de " + kind + " min enviado para " + res.j.sent_to +
              (res.j.x1 ? " · X1 marcado" : "") +
              (res.j.linked_existing ? " · (pedido pendente atualizado)" : " · (só e-mail, sem criar venda)") +
              " · " + money(res.j.amount || 0),
              "ok"
            );
            adminToast("Lembrete " + kind + " min enviado!");
          })
          .catch(function () {
            btn.disabled = false;
            emStatus("Servidor indisponível.", "err");
          });
      }

      document.getElementById("btn-em-remind-5").addEventListener("click", function () {
        emSendReminder(5);
      });
      document.getElementById("btn-em-remind-30").addEventListener("click", function () {
        emSendReminder(30);
      });

      function pxLog(msg) {

        var el = document.getElementById("px-log");
        if (!el) return;
        el.textContent = msg;
      }

      var draftPixels = [];

      function loadPixelConfig() {
        fetch("/api/admin/pixel/config", { headers: authHeaders() })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            if (!res.ok) {
              document.getElementById("px-meta").textContent = res.j.error || "Falha ao carregar.";
              document.getElementById("px-meta").className = "pixel-status err";
              return;
            }
            pixelStoreCache = res.j.stores || {};
            /* Popular o dropdown de lojas */
            var sel = document.getElementById("px-store");
            if (sel) {
              var prevVal = sel.value;
              var keys = Object.keys(pixelStoreCache);
              sel.innerHTML = keys.map(function (k) {
                var info = pixelStoreCache[k] || {};
                var label = info.label || k;
                var count = (info.pixels || []).length;
                return '<option value="' + k + '">' + label + " (" + count + " pixel" + (count !== 1 ? "s" : "") + ")</option>";
              }).join("");
              /* Restaurar seleção anterior se ainda existir */
              if (prevVal && pixelStoreCache[prevVal]) sel.value = prevVal;
              else if (keys.length) sel.value = keys[0];
            }
            fillPixelForm();
          })
          .catch(function () {
            document.getElementById("px-meta").textContent = "Servidor indisponível.";
            document.getElementById("px-meta").className = "pixel-status err";
          });
      }

      function fillPixelForm() {
        var key = document.getElementById("px-store").value;
        var c = pixelStoreCache[key] || { pixels: [] };
        draftPixels = (c.pixels || []).map(function (p) {
          return {
            id: p.id || "",
            label: p.label || "Pixel",
            accessToken: "",
            enabled: p.enabled !== false,
            hasToken: !!p.hasToken,
            tokenHint: p.tokenHint || "",
          };
        });
        if (!draftPixels.length) {
          draftPixels.push({ id: "", label: "Principal", accessToken: "", enabled: true, hasToken: false });
        }
        renderPixelList();
        var meta = document.getElementById("px-meta");
        meta.className = "pixel-status";
        meta.textContent = c.updatedAt
          ? "Última atualização: " + new Date(c.updatedAt).toLocaleString("pt-BR") + " · " + draftPixels.length + " pixel(s)"
          : draftPixels.length + " pixel(s) nesta loja";
        var testIn = document.getElementById("px-test-code");
        var testEn = document.getElementById("px-test-enabled");
        if (testIn) testIn.value = c.testEventCode || "";
        if (testEn) testEn.checked = !!c.testEventEnabled;
        var link = document.getElementById("px-pago-link");
        if (link) {
          link.href = "/pago/?store=" + encodeURIComponent(key);
          link.textContent = "Abrir /pago/?store=" + key + " (Purchase na hora) →";
        }
      }

      function refreshFireTargetSelect() {
        var sel = document.getElementById("px-fire-target");
        if (!sel) return;
        var prev = sel.value;
        var opts = ['<option value="">Todos os pixels ativos</option>'];
        draftPixels.forEach(function (p, i) {
          if (!p.id || !String(p.id).trim() || p.enabled === false) return;
          var label =
            "Pixel #" +
            (i + 1) +
            " — " +
            (p.label || "Principal") +
            " (" +
            p.id.trim() +
            ")";
          opts.push(
            '<option value="' +
              escapeAttr(p.id.trim()) +
              '">' +
              escapeAttr(label) +
              "</option>"
          );
        });
        sel.innerHTML = opts.join("");
        if (prev) sel.value = prev;
      }

      function renderPixelList() {
        var list = document.getElementById("px-list");
        list.innerHTML = draftPixels
          .map(function (p, i) {
            var on = p.enabled !== false;
            return (
              '<div class="px-item" data-i="' + i + '">' +
              '<div class="px-item-top">' +
              "<strong>#" + (i + 1) + " " + (p.label || "Pixel") + " · Loja " + (i + 1) + "</strong>" +
              '<label style="display:inline-flex;align-items:center;gap:4px;margin:0;font-size:12px;color:' +
              (on ? "var(--green)" : "var(--muted)") +
              '">' +
              '<input type="checkbox" data-act="en" ' + (on ? "checked" : "") + " /> " +
              (on ? "ATIVO" : "inativo") +
              "</label>" +
              '<button class="btn-mini danger" type="button" data-act="rm">Remover</button>' +
              "</div>" +
              '<label>Nome</label>' +
              '<input type="text" data-act="label" value="' + escapeAttr(p.label) + '" placeholder="Ex.: Campanha A" />' +
              '<label>Pixel ID (Ads)</label>' +
              '<input type="text" data-act="id" value="' + escapeAttr(p.id) + '" placeholder="Ex.: CXXXXXXXXXXXXXXXXX" autocomplete="off" />' +
              '<label>Access Token (Events API)</label>' +
              '<input type="password" data-act="tok" value="" placeholder="' +
              (p.hasToken ? "Token salvo (" + escapeAttr(p.tokenHint) + ") — vazio mantém" : "Cole o Access Token") +
              '" autocomplete="off" />' +
              "</div>"
            );
          })
          .join("");
        refreshFireTargetSelect();
        list.querySelectorAll('[data-act="en"]').forEach(function (cb) {
          cb.addEventListener("change", function () {
            readDraftFromDom();
            var lab = cb.parentElement;
            if (lab) {
              lab.style.color = cb.checked ? "var(--green)" : "var(--muted)";
              var txt = cb.nextSibling;
              if (txt && txt.nodeType === 3) {
                txt.textContent = cb.checked ? " ATIVO" : " inativo";
              }
            }
            savePixelConfigNow({ quiet: true, toggled: true });
            refreshFireTargetSelect();
          });
        });
        list.querySelectorAll('[data-act="id"], [data-act="label"]').forEach(function (inp) {
          inp.addEventListener("input", function () {
            readDraftFromDom();
            refreshFireTargetSelect();
          });
        });
      }

      function escapeAttr(s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;");
      }

      function readDraftFromDom() {
        var items = document.querySelectorAll("#px-list .px-item");
        draftPixels = Array.prototype.map.call(items, function (el) {
          var i = Number(el.getAttribute("data-i"));
          var prev = draftPixels[i] || {};
          return {
            id: (el.querySelector('[data-act="id"]') || {}).value || "",
            label: (el.querySelector('[data-act="label"]') || {}).value || "Pixel",
            accessToken: (el.querySelector('[data-act="tok"]') || {}).value || "",
            enabled: !!(el.querySelector('[data-act="en"]') || {}).checked,
            hasToken: prev.hasToken,
            tokenHint: prev.tokenHint,
          };
        });
      }

      function ensureTtq(pixelIds) {
        return new Promise(function (resolve) {
          window.TiktokAnalyticsObject = "ttq";
          var ttq = (window.ttq = window.ttq || []);
          if (!ttq.methods) {
            ttq.methods = [
              "page", "track", "identify", "instances", "debug", "on", "off", "once",
              "ready", "alias", "group", "enableCookie", "disableCookie",
              "holdConsent", "revokeConsent", "grantConsent",
            ];
            ttq.setAndDefer = function (t, e) {
              t[e] = function () {
                t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
              };
            };
            for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
            ttq.instance = function (t) {
              for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) {
                ttq.setAndDefer(e, ttq.methods[n]);
              }
              return e;
            };
            ttq.load = function (e, n) {
              var r = "https://analytics.tiktok.com/i18n/pixel/events.js";
              ttq._i = ttq._i || {};
              ttq._i[e] = [];
              ttq._i[e]._u = r;
              ttq._t = ttq._t || {};
              ttq._t[e] = +new Date();
              ttq._o = ttq._o || {};
              ttq._o[e] = n || {};
              if (!document.getElementById("tiktok-pixel-sdk")) {
                var o = document.createElement("script");
                o.id = "tiktok-pixel-sdk";
                o.type = "text/javascript";
                o.async = true;
                o.src = r + "?sdkid=" + e + "&lib=ttq";
                var a = document.getElementsByTagName("script")[0];
                a.parentNode.insertBefore(o, a);
              }
            };
          }
          (pixelIds || []).forEach(function (id) {
            try {
              ttq.load(id);
            } catch (e) {}
          });
          var script = document.getElementById("tiktok-pixel-sdk");
          var done = false;
          function finish() {
            if (done) return;
            done = true;
            try {
              ttq.page();
            } catch (e2) {}
            setTimeout(resolve, 500);
          }
          if (script) {
            script.addEventListener("load", finish);
            script.addEventListener("error", finish);
            setTimeout(finish, 3000);
          } else {
            finish();
          }
        });
      }

      function fakeBrowserMatch() {
        var n = Date.now() % 900000000;
        var ddds = ["11", "21", "31", "41", "51", "61", "71", "81", "85"];
        var ddd = ddds[n % ddds.length];
        return {
          email: "cliente" + n + "@gmail.com",
          phone_number: "+55" + ddd + "9" + String(10000000 + (n % 89999999)).padStart(8, "0"),
        };
      }

      function fireBrowserEvents(pixelIds, browserEvents) {
        return ensureTtq(pixelIds).then(function () {
          var lines = [];
          lines.push("Pixels browser: " + pixelIds.join(", "));
          try {
            window.ttq.identify(fakeBrowserMatch());
            lines.push("✓ ttq.identify(email+phone aleatórios)");
          } catch (eId) {}
          (browserEvents || []).forEach(function (ev) {
            (pixelIds || []).forEach(function (pid) {
              try {
                if (ev.name === "PageView") {
                  window.ttq.page();
                  lines.push("✓ ttq.page()");
                } else {
                  var inst = window.ttq.instance(pid);
                  if (inst && typeof inst.track === "function") {
                    inst.track(ev.name, ev.params || {});
                  } else {
                    window.ttq.track(ev.name, ev.params || {});
                  }
                  lines.push("✓ [" + pid.slice(0, 8) + "…] " + ev.name);
                }
              } catch (err) {
                lines.push("✗ " + pid + " " + ev.name + ": " + (err.message || err));
              }
            });
          });
          return lines;
        });
      }

      document.getElementById("px-store").addEventListener("change", fillPixelForm);

      function savePixelConfigNow(opts) {
        opts = opts || {};
        readDraftFromDom();
        var store = document.getElementById("px-store").value;
        var meta = document.getElementById("px-meta");
        meta.className = "pixel-status";
        meta.textContent = opts.quiet ? "Salvando remoção…" : "Salvando…";
        return fetch("/api/admin/pixel/config", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            store: store,
            testEventCode: (document.getElementById("px-test-code") || {}).value || "",
            testEventEnabled: !!(document.getElementById("px-test-enabled") || {}).checked,
            pixels: draftPixels
              .map(function (p) {
                return {
                  id: (p.id || "").trim(),
                  label: p.label,
                  accessToken: p.accessToken,
                  enabled: p.enabled !== false,
                };
              })
              .filter(function (p) {
                return !!p.id;
              }),
          }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            if (!res.ok) {
              meta.className = "pixel-status err";
              meta.textContent = res.j.error || "Falha ao salvar.";
              return res;
            }
            meta.className = "pixel-status ok";
            meta.textContent =
              (opts.removed ? "Removido e salvo. " : "Salvo. ") +
              "(" + res.j.count + " pixel(s))" +
              (res.j.cleared ? " HTML limpo." : res.j.applied_to_html ? " HTML atualizado." : "") +
              (res.j.apply_error ? " (HTML: " + res.j.apply_error + ")" : "");
            loadPixelConfig();
            return res;
          })
          .catch(function () {
            meta.className = "pixel-status err";
            meta.textContent = "Servidor indisponível.";
          });
      }

      document.getElementById("px-list").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-act]");
        if (!btn || btn.tagName === "INPUT") return;
        var act = btn.getAttribute("data-act");
        if (act !== "rm") return;
        readDraftFromDom();
        var item = e.target.closest(".px-item");
        var i = Number(item.getAttribute("data-i"));
        var removed = draftPixels[i];
        draftPixels.splice(i, 1);
        if (!draftPixels.length) {
          draftPixels.push({ id: "", label: "Principal", accessToken: "", enabled: true });
        }
        renderPixelList();
        /* remove de verdade: salva na hora (não espera clicar em Salvar) */
        savePixelConfigNow({ quiet: true, removed: true }).then(function (res) {
          if (res && res.ok) {
            pxLog(
              "Pixel removido" +
                (removed && removed.id ? " (" + removed.id + ")" : "") +
                " e salvo. Não volta no F5."
            );
          }
        });
      });

      document.getElementById("btn-px-add").addEventListener("click", function () {
        readDraftFromDom();
        draftPixels.push({
          id: "",
          label: "Pixel " + (draftPixels.length + 1),
          accessToken: "",
          enabled: true,
        });
        renderPixelList();
      });

      document.getElementById("btn-px-save").addEventListener("click", function () {
        savePixelConfigNow();
      });

      document.getElementById("btn-px-warm").addEventListener("click", async function () {
        var btn = document.getElementById("btn-px-warm");
        var store = document.getElementById("px-store").value;
        var testCode = document.getElementById("px-test-code").value.trim();
        var testEnabled = document.getElementById("px-test-enabled").checked;
        var total = Math.max(1, Math.min(50000, parseInt(document.getElementById("px-warm-n").value, 10) || 1000));
        document.getElementById("px-warm-n").value = String(total);
        readDraftFromDom();
        var extra = draftPixels
          .filter(function (p) { return p.id.trim() && p.enabled !== false; })
          .map(function (p) {
            return { id: p.id.trim(), label: p.label, accessToken: p.accessToken, enabled: true };
          });
        var skippedOff = draftPixels.filter(function (p) {
          return p.id.trim() && p.enabled === false;
        });
        if (!extra.length) {
          pxLog("ERRO: nenhum pixel ATIVO. Marque “ativo” e Salve com Access Token.");
          return;
        }
        btn.disabled = true;
        var CHUNK = 5000;
        var offset = 0;
        var grand = 0;
        var lines = [
          "🔥 Aquecendo Purchase × " + total,
          "Loja: " + store,
          "Pixels ATIVOS: " + extra.map(function (p) { return p.id; }).join(", ") +
            " (" + extra.length + ")",
          skippedOff.length
            ? "Ignorados (inativos): " + skippedOff.map(function (p) { return p.id; }).join(", ")
            : "",
          "Test code: " + (testEnabled && testCode ? testCode + " (ATIVO)" : "desligado"),
          "Enviando via Events API em lotes de " + CHUNK + "…",
          "",
        ].filter(Boolean);
        pxLog(lines.join("\n"));
        try {
          while (offset < total) {
            var n = Math.min(CHUNK, total - offset);
            btn.textContent = "Aquecendo " + offset + "/" + total + "…";
            var chunkOk = false;
            var htmlTries = 0;
            var res = null;
            while (!chunkOk && htmlTries < 4) {
              try {
                res = await fetch("/api/admin/pixel/fire-purchase", {
                  method: "POST",
                  headers: authHeaders({ "Content-Type": "application/json" }),
                  body: JSON.stringify({
                    store: store,
                    count: n,
                    offset: offset,
                    testEventCode: testEnabled ? testCode : "",
                    useTestCode: testEnabled,
                    useDraftPixels: true,
                    extraPixels: extra,
                  }),
                }).then(async function (r) {
                  var text = await r.text();
                  var j = null;
                  try { j = text ? JSON.parse(text) : {}; }
                  catch (eParse) {
                    var looksHtml = /^\s*</.test(text || "");
                    var err = new Error(looksHtml ? "HTML_TIMEOUT" : "Resposta inválida: " + String(text || "").slice(0, 120));
                    err.code = looksHtml ? "HTML_TIMEOUT" : "BAD_JSON";
                    throw err;
                  }
                  return { ok: r.ok, j: j };
                });
                chunkOk = true;
              } catch (chunkErr) {
                if (chunkErr && chunkErr.code === "HTML_TIMEOUT" && htmlTries < 3) {
                  htmlTries++;
                  lines.push("⚠ Timeout no lote " + offset + " — retry " + htmlTries + "/3…");
                  pxLog(lines.join("\n"));
                  await new Promise(function (r) { setTimeout(r, 1500 * htmlTries); });
                  continue;
                }
                throw new Error(
                  chunkErr && chunkErr.code === "HTML_TIMEOUT"
                    ? "Servidor respondeu HTML (timeout). Já pausamos em " + offset + "/" + total + ". Deixe só 1 pixel ATIVO."
                    : chunkErr.message || String(chunkErr)
                );
              }
            }
            var j = (res && res.j) || {};
            if (!res || !res.ok) {
              lines.push("ERRO: " + (j.error || "falha"));
              break;
            }
            var chunkSent = Number(j.sent) || 0;
            grand += chunkSent;
            lines.push(
              "Lote +" + n + " (offset " + offset + ") → enviados " + chunkSent +
              " | total nesta rodada: " + grand + "/" + total
            );
            (j.api || []).forEach(function (a) {
              if (!a.sent) {
                lines.push("  ✗ " + a.pixelId + " → " + (a.reason || a.error || "falha"));
              }
            });
            pxLog(lines.join("\n"));
            if (chunkSent === 0) {
              lines.push("Parou: lote sem envio. Confira Access Token do pixel ATIVO e Salve.");
              break;
            }
            offset =
              j.nextOffset != null
                ? Number(j.nextOffset)
                : offset + (Number(j.count) || n);
            await new Promise(function (r) { setTimeout(r, 120); });
          }
          lines.push("");
          lines.push("✔ Concluído nesta rodada: " + grand + " eventos CompletePayment.");
          lines.push("Clique de novo para somar mais (ex.: 50.000).");
          pxLog(lines.join("\n"));
        } catch (err) {
          lines.push("ERRO rede: " + (err.message || err));
          pxLog(lines.join("\n"));
        }
        btn.disabled = false;
        btn.textContent = "🔥 Aquecer Purchase";
      });

      document.getElementById("btn-px-fire").addEventListener("click", function () {
        var btn = document.getElementById("btn-px-fire");
        var store = document.getElementById("px-store").value;
        var testCode = document.getElementById("px-test-code").value.trim();
        var testEnabled = document.getElementById("px-test-enabled").checked;
        readDraftFromDom();
        refreshFireTargetSelect();
        var targetPixelId = (document.getElementById("px-fire-target") || {}).value || "";
        var extra = draftPixels
          .filter(function (p) {
            if (!p.id.trim() || p.enabled === false) return false;
            if (targetPixelId && p.id.trim() !== targetPixelId) return false;
            return true;
          })
          .map(function (p) {
            return { id: p.id.trim(), label: p.label, accessToken: p.accessToken, enabled: true };
          });
        if (!extra.length) {
          pxLog("ERRO: nenhum pixel ATIVO" + (targetPixelId ? " no alvo selecionado" : "") + ".");
          return;
        }
        btn.disabled = true;
        btn.textContent = "Disparando…";
        pxLog(
          "Enviando eventos…" +
            "\nAlvo: " +
            (targetPixelId || "Todos os pixels ativos") +
            "\nPixels: " +
            extra.map(function (p) {
              return p.id;
            }).join(", ") +
            (testEnabled && testCode ? "\nTest code ATIVO: " + testCode : "\nTest code desligado")
        );
        fetch("/api/admin/pixel/fire", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            store: store,
            testEventCode: testEnabled ? testCode : "",
            useDraftPixels: true,
            targetPixelId: targetPixelId || undefined,
            extraPixels: extra,
          }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            var draftIds = extra.map(function (p) {
              return p.id;
            });
            var j = res.j || {};
            var pixelIds = (j.pixelIds && j.pixelIds.length ? j.pixelIds : draftIds) || [];
            var browserEvents = j.browserEvents;
            if (!browserEvents || !browserEvents.length) {
              browserEvents = [
                { name: "PageView", params: {} },
                {
                  name: "ViewContent",
                  params: { content_type: "product", currency: "BRL", value: 97.7 },
                },
                {
                  name: "CompletePayment",
                  params: { content_type: "product", currency: "BRL", value: 97.7 },
                },
                {
                  name: "PlaceAnOrder",
                  params: { content_type: "product", currency: "BRL", value: 97.7 },
                },
              ];
            }
            if (!pixelIds.length) {
              pxLog("ERRO: " + (j.error || "Nenhum pixel ID no formulário. Adicione e salve."));
              btn.disabled = false;
              btn.textContent = "Disparar todos os eventos";
              return;
            }
            return fireBrowserEvents(pixelIds, browserEvents).then(function (browserLines) {
              var lines = [];
              if (!res.ok) {
                lines.push("AVISO API: " + (j.error || "falha") + " — disparo browser mesmo assim");
                lines.push("");
              }
              lines.push("Loja: " + (j.store || store));
              lines.push("Pixels: " + pixelIds.join(", "));
              lines.push("Atalho Purchase: " + (location.origin + (j.pagoUrl || "/pago/?store=" + store)));
              lines.push("");
              lines.push("— Browser (ttq nativo) —");
              lines = lines.concat(browserLines);
              lines.push("");
              lines.push("— Events API —");
              (j.api || []).forEach(function (a) {
                if (a.sent) {
                  lines.push(a.pixelId + " → HTTP " + a.http_status);
                  lines.push(JSON.stringify(a.response, null, 2));
                } else {
                  lines.push(a.pixelId + " → " + (a.reason || a.error || "não enviado"));
                }
              });
              if (!(j.api || []).length) {
                lines.push("(sem Events API — só browser; token opcional no pixel)");
              }
              lines.push("");
              lines.push("Confirme no Events Manager / Test Events. Ou abra /pago/?store=" + store);
              pxLog(lines.join("\n"));
              btn.disabled = false;
              btn.textContent = "Disparar todos os eventos";
            });
          })
          .catch(function (err) {
            pxLog("ERRO: " + (err.message || "rede"));
            btn.disabled = false;
            btn.textContent = "Disparar todos os eventos";
          });
      });

      document.getElementById("login-form").addEventListener("submit", function (e) {
        e.preventDefault();
        loginErr.textContent = "";
        btnLogin.disabled = true;
        btnLogin.textContent = "Entrando…";
        fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: document.getElementById("login-user").value.trim(),
            pass: document.getElementById("login-pass").value,
          }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            btnLogin.disabled = false;
            btnLogin.textContent = "Entrar";
            if (!res.ok) {
              loginErr.textContent = res.j.error || "Falha no login.";
              return;
            }
            localStorage.setItem(TOKEN_KEY, res.j.token);
            setRole(res.j.role || "admin");
            showPanel();
          })
          .catch(function () {
            btnLogin.disabled = false;
            btnLogin.textContent = "Entrar";
            loginErr.textContent = "Servidor indisponível.";
          });
      });

      document.getElementById("btn-logout").addEventListener("click", function () {
        fetch("/api/admin/logout", {
          method: "POST",
          headers: authHeaders(),
        })
          .catch(function () {})
          .then(function () {
            showLogin(true);
          });
      });

      var btnTxApply = document.getElementById("btn-tx-apply");
      if (btnTxApply) {
        btnTxApply.addEventListener("click", function () {
          var f = document.getElementById("dt-from").value;
          var t = document.getElementById("dt-to").value;
          if (f && t) lastRange = { from: f, to: t };
          else lastRange = null;
          loadStats();
          loadTransactions(true);
        });
      }
      var btnTxReload = document.getElementById("btn-tx-reload");
      if (btnTxReload) btnTxReload.addEventListener("click", function () { loadTransactions(true); });
      var btnTxMore = document.getElementById("btn-tx-more");
      if (btnTxMore) {
        btnTxMore.addEventListener("click", function () {
          if (!txListHasMore) return;
          loadTransactions(false);
        });
      }
      var txFilterStatus = document.getElementById("tx-filter-status");
      if (txFilterStatus) {
        txFilterStatus.addEventListener("change", function () { loadTransactions(true); });
      }
      var txSearchEl = document.getElementById("tx-search");
      if (txSearchEl) {
        var txSearchTimer = null;
        txSearchEl.addEventListener("input", function () {
          clearTimeout(txSearchTimer);
          txSearchTimer = setTimeout(function () { loadTransactions(true); }, 400);
        });
      }

      var btnRangeClear2 = document.getElementById("btn-range-clear-2");
      if (btnRangeClear2) {
        btnRangeClear2.addEventListener("click", function () {
          lastRange = null;
          var lab2 = document.getElementById("custom-range-label");
          if (lab2) lab2.textContent = "Personalizado";
          var rrp2 = document.getElementById("range-result-panel");
          if (rrp2) rrp2.hidden = true;
          var rrOv2 = document.getElementById("range-result-ov");
          if (rrOv2) rrOv2.textContent = "Nenhum filtro de data ativo.";
          loadStats();
          loadTransactions(true);
        });
      }
      var btnRangeClear = document.getElementById("btn-range-clear");
      if (btnRangeClear) {
        btnRangeClear.addEventListener("click", function () {
          lastRange = null;
          document.getElementById("dt-from").value = "";
          document.getElementById("dt-to").value = "";
          document.getElementById("range-result").textContent = "";
          loadStats();
          loadTransactions(true);
        });
      }

      function periodCard(title, p) {
        return (
          '<div class="period-card">' +
          "<h4>" + title + "</h4>" +
          '<div class="p-gross">' + money(p.gross) + "</div>" +
          '<div class="p-net">Líquido ' + money(p.net) + "</div>" +
          '<div class="p-meta"><b style="color:var(--green)">' + p.paid_count + " pago" + (p.paid_count === 1 ? "" : "s") + "</b>" +
          ' · <b style="color:var(--orange)">' + p.pending_count + " pendente" + (p.pending_count === 1 ? "" : "s") + "</b>" +
          "</div></div>"
        );
      }

      /* ---------- chips coloridos por gateway ---------- */
      var GW_COLORS = {
        purincash: "#34d399",
        ironpay: "#9ca3af",
        buckpay: "#a78bfa",
        pixzy: "#7dd3fc",
        sharpify: "#2563eb",
        veno: "#fb923c",
        blackcat: "#16a34a",
      };
      function gwChip(gwRaw) {
        var g = String(gwRaw || "—").toLowerCase().trim();
        var c = GW_COLORS[g];
        var bg, bd;
        if (c) { bg = c + "22"; bd = c + "55"; }
        else {
          var h = 0;
          for (var i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) % 360;
          c = "hsl(" + h + " 70% 62%)";
          bg = "hsl(" + h + " 70% 62% / .15)";
          bd = "hsl(" + h + " 70% 62% / .4)";
        }
        return (
          '<span class="gw-chip" style="color:' + c + ";background:" + bg + ";border:1px solid " + bd + '">' +
          escapeHtml(g.slice(0, 12)) +
          "</span>"
        );
      }

      function statusBadge(st) {
        var labels = { paid: "Pago", pending: "Pendente", expired: "Expirado", failed: "Falhou" };
        return '<span class="badge ' + st + '">' + (labels[st] || st) + "</span>";
      }


      function renderReconcile(d) {
        var paid = Number(d.paid) || 0;
        var tracked = Number(d.tracked) || 0;
        var delta = Number(d.delta != null ? d.delta : d.missing) || 0;
        document.getElementById("rc-paid").textContent = String(paid);
        document.getElementById("rc-tracked").textContent = String(tracked);
        document.getElementById("rc-delta").textContent = String(delta);
        var card = document.getElementById("rc-delta-card");
        card.classList.remove("rc-ok", "rc-bad");
        card.classList.add(delta === 0 ? "rc-ok" : "rc-bad");

        var ob = document.getElementById("rc-origin-body");
        var oe = document.getElementById("rc-origin-empty");
        var rows = d.byOrigin || [];
        if (!rows.length) {
          ob.innerHTML = "";
          oe.hidden = false;
        } else {
          oe.hidden = true;
          ob.innerHTML = rows
            .map(function (r) {
              var dlt = Number(r.delta) || 0;
              return (
                "<tr>" +
                "<td>" + escapeAttr(r.origem) + "</td>" +
                "<td>" + escapeAttr(r.campanha) + "</td>" +
                "<td>" + (r.pagos || 0) + "</td>" +
                "<td>" + (r.enviados || 0) + "</td>" +
                "<td style=\"color:" + (dlt ? "var(--orange)" : "var(--green)") + ";font-weight:700\">" + dlt + "</td>" +
                "</tr>"
              );
            })
            .join("");
        }

        var mb = document.getElementById("rc-miss-body");
        var me = document.getElementById("rc-miss-empty");
        var miss = d.missingOrders || [];
        if (!miss.length) {
          mb.innerHTML = "";
          me.hidden = false;
        } else {
          me.hidden = true;
          mb.innerHTML = miss
            .map(function (t) {
              var when = t.paid_at ? new Date(t.paid_at).toLocaleString("pt-BR") : "—";
              return (
                "<tr>" +
                "<td>" + when + "</td>" +
                "<td>" + escapeAttr(t.client_name || "—") + "</td>" +
                "<td>" + money(t.amount || 0) + "</td>" +
                "<td>" + escapeAttr(t.tracking_code || "—") + "</td>" +
                "<td>" + escapeAttr(t.origem || "—") + "</td>" +
                "</tr>"
              );
            })
            .join("");
        }

        var histEl = document.getElementById("rc-hist");
        var hist = d.history || [];
        if (!hist.length) {
          histEl.innerHTML = '<div class="rc-hist-item">Nenhuma checagem ainda. Clique em <b>Checar PIX agora</b>.</div>';
        } else {
          histEl.innerHTML = hist
            .slice(0, 15)
            .map(function (h) {
              var when = h.at ? new Date(h.at).toLocaleString("pt-BR") : "—";
              return (
                '<div class="rc-hist-item"><b>' + when + "</b> · " +
                "checou " + (h.checked || 0) + " pedidos · " +
                (h.newly_paid || 0) + " pagamento(s) novo(s) · " +
                "Purchase reenviado: " + (h.purchase_resent || 0) +
                " · Δ " + (h.missing != null ? h.missing : "—") +
                (h.note ? " · " + escapeAttr(h.note) : "") +
                "</div>"
              );
            })
            .join("");
        }
      }

      /* ---------- Performance ---------- */
      function loadPerformance() {
        fetch("/api/admin/performance", { headers: authHeaders() })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            if (!res.ok) return;
            var d = res.j || {};
            var sum = d.summary || {};
            var set = function (id, v) {
              var el = document.getElementById(id);
              if (el) el.textContent = v;
            };
            set("perf-pedidos", String(sum.pedidos || 0));
            set("perf-pagos", String(sum.pagos || 0));
            set("perf-unidades", String(sum.unidades || 0));
            set("perf-receita", money(sum.receita || 0));

            var rankBody = document.getElementById("perf-rank-body");
            var rankEmpty = document.getElementById("perf-rank-empty");
            var ranking = d.ranking || [];
            if (rankBody) {
              if (!ranking.length) {
                rankBody.innerHTML = "";
                if (rankEmpty) rankEmpty.hidden = false;
              } else {
                if (rankEmpty) rankEmpty.hidden = true;
                rankBody.innerHTML = ranking
                  .map(function (p, i) {
                    return (
                      "<tr><td>" +
                      (i + 1) +
                      "</td><td>" +
                      esc(p.produto) +
                      "</td><td>" +
                      p.vendas +
                      "</td><td>" +
                      money(p.receita) +
                      "</td></tr>"
                    );
                  })
                  .join("");
              }
            }

            var storeBody = document.getElementById("perf-store-body");
            var storeEmpty = document.getElementById("perf-store-empty");
            var stores = d.stores || [];
            if (storeBody) {
              if (!stores.length) {
                storeBody.innerHTML = "";
                if (storeEmpty) storeEmpty.hidden = false;
              } else {
                if (storeEmpty) storeEmpty.hidden = true;
                storeBody.innerHTML = stores
                  .map(function (s) {
                    return (
                      "<tr><td>" +
                      esc(s.name) +
                      "</td><td>" +
                      s.pedidos +
                      "</td><td>" +
                      s.pagos +
                      "</td><td>" +
                      s.unidades +
                      "</td><td>" +
                      s.conversao +
                      "%</td><td>" +
                      money(s.receita) +
                      "</td></tr>"
                    );
                  })
                  .join("");
              }
            }

            var byEl = document.getElementById("perf-by-store-products");
            var byEmpty = document.getElementById("perf-by-store-empty");
            var anyProd = false;
            if (byEl) {
              byEl.innerHTML = stores
                .map(function (s) {
                  var prods = s.products || [];
                  if (!prods.length) return "";
                  anyProd = true;
                  return (
                    '<div style="margin-bottom:14px"><strong style="font-size:13px">' +
                    esc(s.name) +
                    "</strong>" +
                    '<div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Produto</th><th>Vendas</th><th>Unidades</th><th>Receita</th></tr></thead><tbody>' +
                    prods
                      .map(function (p) {
                        return (
                          "<tr><td>" +
                          esc(p.produto) +
                          "</td><td>" +
                          p.vendas +
                          "</td><td>" +
                          p.unidades +
                          "</td><td>" +
                          money(p.receita) +
                          "</td></tr>"
                        );
                      })
                      .join("") +
                    "</tbody></table></div></div>"
                  );
                })
                .join("");
            }
            if (byEmpty) byEmpty.hidden = anyProd;

            var logBody = document.getElementById("perf-log-body");
            var logEmpty = document.getElementById("perf-log-empty");
            var log = d.log || [];
            if (logBody) {
              if (!log.length) {
                logBody.innerHTML = "";
                if (logEmpty) logEmpty.hidden = false;
              } else {
                if (logEmpty) logEmpty.hidden = true;
                logBody.innerHTML = log
                  .map(function (row) {
                    var dt = row.at ? new Date(row.at) : null;
                    var when =
                      dt && !isNaN(dt.getTime())
                        ? dt.toLocaleString("pt-BR")
                        : "—";
                    return (
                      "<tr><td>" +
                      when +
                      "</td><td>" +
                      esc(row.loja_name || "—") +
                      "</td><td>" +
                      esc(row.produto || "—") +
                      "</td><td>" +
                      money(row.amount || 0) +
                      "</td></tr>"
                    );
                  })
                  .join("");
              }
            }
          })
          .catch(function () {});
      }

      /* ---------- ROI diário (multi-loja) ---------- */
      var roiDays = 7;

      function roiFmtPct(v) {
        if (v == null || !isFinite(v)) return "—";
        var s = (Math.round(v * 100) / 100).toLocaleString("pt-BR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
        return s + "%";
      }

      function roiSignedClass(cents) {
        if (cents > 0) return "roi-pos";
        if (cents < 0) return "roi-neg";
        return "";
      }

      function roiParseReais(str) {
        var s = String(str == null ? "" : str).trim();
        if (!s) return 0;
        s = s.replace(/[R$\s]/gi, "");
        if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) {
          s = s.replace(/\./g, "").replace(",", ".");
        } else if (s.indexOf(",") >= 0) {
          s = s.replace(",", ".");
        }
        var n = Number(s);
        if (!isFinite(n) || n < 0) return 0;
        return Math.round(n * 100);
      }

      function roiStatus(msg, cls) {
        var el = document.getElementById("roi-status");
        if (!el) return;
        el.className = "pixel-status" + (cls ? " " + cls : "");
        el.textContent = msg || "";
      }

      function renderRoi(report) {
        if (!report) return;
        var sum = report.summary || {};
        var setN = function (id, cents, signed) {
          var el = document.getElementById(id);
          if (!el) return;
          el.textContent = money(cents || 0);
          el.className = "n" + (signed ? " " + roiSignedClass(cents || 0) : "");
        };
        setN("roi-sum-spend", sum.spend || 0, false);
        setN("roi-sum-rev", sum.revenue || 0, false);
        setN("roi-sum-profit", sum.profit || 0, true);
        var roiEl = document.getElementById("roi-sum-roi");
        if (roiEl) {
          roiEl.textContent = roiFmtPct(sum.roi);
          roiEl.className = "n" + (sum.roi == null ? "" : " " + roiSignedClass(sum.profit || 0));
        }

        var body = document.getElementById("roi-body");
        var empty = document.getElementById("roi-empty");
        var rows = report.rows || [];
        if (!body) return;
        if (!rows.length) {
          body.innerHTML = "";
          if (empty) empty.hidden = false;
          return;
        }
        if (empty) empty.hidden = true;

        body.innerHTML = rows
          .map(function (r, idx) {
            var dateLabel = r.date;
            try {
              var p = String(r.date).split("-");
              dateLabel = p[2] + "/" + p[1] + "/" + p[0];
            } catch (e) {}
            if (r.is_today && !r.is_total) dateLabel += " (hoje)";

            var trClass = [];
            if (r.is_today) trClass.push("roi-today");
            if (r.is_total) trClass.push("roi-total");

            if (r.is_total) {
              return (
                '<tr class="' +
                trClass.join(" ") +
                '">' +
                "<td>" +
                dateLabel +
                "</td>" +
                "<td>TOTAL</td>" +
                "<td>" +
                money(r.revenue || 0) +
                "</td>" +
                "<td>" +
                money(r.spend || 0) +
                "</td>" +
                '<td class="' +
                roiSignedClass(r.profit || 0) +
                '">' +
                money(r.profit || 0) +
                "</td>" +
                '<td class="' +
                (r.roi == null ? "" : roiSignedClass(r.profit || 0)) +
                '">' +
                roiFmtPct(r.roi) +
                "</td>" +
                "<td></td>" +
                "</tr>"
              );
            }

            var spendReais = ((r.spend || 0) / 100).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            return (
              '<tr class="' +
              trClass.join(" ") +
              '" data-roi-idx="' +
              idx +
              '">' +
              "<td>" +
              dateLabel +
              "</td>" +
              "<td>" +
              (r.label || r.store || "—") +
              "</td>" +
              "<td>" +
              money(r.revenue || 0) +
              "</td>" +
              '<td><input class="roi-spend-input" type="text" inputmode="decimal" data-date="' +
              r.date +
              '" data-store="' +
              (r.store || "") +
              '" value="' +
              spendReais +
              '" /></td>' +
              '<td class="' +
              roiSignedClass(r.profit || 0) +
              '">' +
              money(r.profit || 0) +
              "</td>" +
              '<td class="' +
              (r.roi == null ? "" : roiSignedClass(r.profit || 0)) +
              '">' +
              roiFmtPct(r.roi) +
              "</td>" +
              '<td><button class="btn-roi-save" type="button" data-save-idx="' +
              idx +
              '">Salvar</button></td>' +
              "</tr>"
            );
          })
          .join("");
      }

      function loadRoi() {
        roiStatus("Carregando…");
        fetch("/api/admin/roi?days=" + encodeURIComponent(roiDays), {
          headers: authHeaders(),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            if (!res.ok) {
              roiStatus(res.j.error || "Falha ao carregar ROI.", "err");
              return;
            }
            renderRoi(res.j);
            roiStatus("");
          })
          .catch(function () {
            roiStatus("Falha de rede ao carregar ROI.", "err");
          });
      }

      function saveRoiSpend(date, store, amountCents, btn) {
        if (!store) {
          roiStatus("Loja inválida.", "err");
          return;
        }
        if (btn) btn.disabled = true;
        roiStatus("Gasto salvo. Recalculando ROI…", "ok");
        fetch("/api/admin/roi/spend", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            date: date,
            store: store,
            amount: amountCents,
            days: roiDays,
          }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            if (btn) btn.disabled = false;
            if (!res.ok) {
              roiStatus(res.j.error || "Falha ao salvar gasto.", "err");
              return;
            }
            if (res.j.report) renderRoi(res.j.report);
            else loadRoi();
            roiStatus("Gasto salvo.", "ok");
          })
          .catch(function () {
            if (btn) btn.disabled = false;
            roiStatus("Falha de rede ao salvar.", "err");
          });
      }

      document.getElementById("roi-filters").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-roi-days]");
        if (!btn) return;
        roiDays = parseInt(btn.getAttribute("data-roi-days"), 10) || 7;
        document.querySelectorAll("#roi-filters .btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
        loadRoi();
      });

      document.getElementById("roi-body").addEventListener("click", function (e) {
        var btn = e.target.closest(".btn-roi-save");
        if (!btn) return;
        var tr = btn.closest("tr");
        if (!tr) return;
        var input = tr.querySelector(".roi-spend-input");
        if (!input) return;
        saveRoiSpend(
          input.getAttribute("data-date"),
          input.getAttribute("data-store"),
          roiParseReais(input.value),
          btn
        );
      });

      document.getElementById("roi-body").addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        var input = e.target.closest(".roi-spend-input");
        if (!input) return;
        e.preventDefault();
        var tr = input.closest("tr");
        var btn = tr && tr.querySelector(".btn-roi-save");
        saveRoiSpend(
          input.getAttribute("data-date"),
          input.getAttribute("data-store"),
          roiParseReais(input.value),
          btn
        );
      });

      function loadReconcile() {
        var st = document.getElementById("rc-status");
        if (st) {
          st.className = "pixel-status";
          st.textContent = "Carregando…";
        }
        fetch("/api/admin/reconcile", { headers: authHeaders() })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            if (!res.ok) {
              if (st) {
                st.className = "pixel-status err";
                st.textContent = res.j.error || "Falha ao carregar.";
              }
              return;
            }
            renderReconcile(res.j);
            if (st) {
              st.className = "pixel-status ok";
              st.textContent =
                "Atualizado · Δ " + (res.j.delta || 0) + " faltando" +
                (res.j.updatedAt ? " · " + new Date(res.j.updatedAt).toLocaleString("pt-BR") : "");
            }
          })
          .catch(function () {
            if (st) {
              st.className = "pixel-status err";
              st.textContent = "Servidor indisponível.";
            }
          });
      }

      function runReconcileAction(url, label) {
        var st = document.getElementById("rc-status");
        var btns = ["btn-rc-check", "btn-rc-resend", "btn-rc-refresh"];
        btns.forEach(function (id) {
          var b = document.getElementById(id);
          if (b) b.disabled = true;
        });
        st.className = "pixel-status";
        st.textContent = label + "…";
        fetch(url, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: "{}" })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (res) {
            btns.forEach(function (id) {
              var b = document.getElementById(id);
              if (b) b.disabled = false;
            });
            if (!res.ok) {
              st.className = "pixel-status err";
              st.textContent = res.j.error || "Falha.";
              return;
            }
            renderReconcile(res.j);
            var extra = "";
            if (res.j.check) {
              extra =
                " Checou " + res.j.check.checked +
                ", novos pagos: " + res.j.check.newly_paid +
                ", Purchase enviado: " + res.j.check.purchase_resent + ".";
            }
            if (res.j.resend) {
              extra =
                " Reenviou " + res.j.resend.ok + "/" + res.j.resend.attempted +
                (res.j.resend.fail ? " (falhas: " + res.j.resend.fail + ")" : "") + ".";
            }
            st.className = "pixel-status ok";
            st.textContent = "OK · Δ " + (res.j.delta || 0) + "." + extra;
          })
          .catch(function () {
            btns.forEach(function (id) {
              var b = document.getElementById(id);
              if (b) b.disabled = false;
            });
            st.className = "pixel-status err";
            st.textContent = "Servidor indisponível.";
          });
      }

      document.getElementById("btn-rc-check").addEventListener("click", function () {
        runReconcileAction("/api/admin/reconcile/check-pix", "Checando PIX na Pixzy");
      });
      document.getElementById("btn-rc-resend").addEventListener("click", function () {
        runReconcileAction("/api/admin/reconcile/resend-missing", "Reenviando Purchase faltantes");
      });
      document.getElementById("btn-rc-refresh").addEventListener("click", function () {
        loadReconcile();
      });

      var funnelDaysEl = document.getElementById("funnel-days");
      if (funnelDaysEl) funnelDaysEl.addEventListener("change", loadFunnel);
      var funnelStoreEl = document.getElementById("funnel-store");
      if (funnelStoreEl) funnelStoreEl.addEventListener("change", loadFunnel);
      var btnFunnelRefresh = document.getElementById("btn-funnel-refresh");
      if (btnFunnelRefresh) btnFunnelRefresh.addEventListener("click", loadFunnel);
      var fnProductStat = document.getElementById("fn-product-stat");
      var funnelProductPanel = document.getElementById("funnel-product-visitors-panel");
      if (fnProductStat && funnelProductPanel) {
        fnProductStat.addEventListener("click", function () {
          if (funnelProductPanel.hidden) {
            funnelProductPanel.hidden = false;
            fnProductStat.classList.add("open");
            renderFunnelProductVisitors();
            try {
              funnelProductPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
            } catch (eScroll) {}
          } else {
            funnelProductPanel.hidden = true;
            fnProductStat.classList.remove("open");
          }
        });
      }

      function indexTxList(rows, append) {
        if (!append) {
          lastRecent = rows.slice();
          lastRecentById = Object.create(null);
        } else {
          lastRecent = lastRecent.concat(rows);
        }
        lastRecent.forEach(function (t) {
          if (t && t.id) lastRecentById[t.id] = t;
        });
      }

      function txRowHtml(t) {
        var dt = new Date(t.created_at);
        var when =
          dt.toLocaleDateString("pt-BR") +
          " " +
          dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        var x1cell;
        if (t.status === "paid") {
          x1cell = "—";
        } else if (t.x1) {
          x1cell =
            '<button class="btn-x1 done" type="button" data-x1-id="' +
            esc(t.id) +
            '">X1 FEITO</button>';
        } else {
          x1cell =
            '<button class="btn-x1" type="button" data-x1-id="' +
            esc(t.id) +
            '">MARCAR X1</button>';
        }
        var gwFull = t.gateway || t.source || "—";
        return (
          '<tr class="txrow tx-' + esc(String(t.status || "other")) + '" data-tx-id="' +
          esc(t.id) +
          '">' +
          "<td>" +
          when +
          "</td>" +
          "<td>" +
          esc(t.client_name || "—") +
          "</td>" +
          "<td>" +
          money(t.amount) +
          "</td>" +
          "<td>" +
          (t.net != null ? money(t.net) : "—") +
          "</td>" +
          "<td>" +
          statusBadge(t.status) +
          "</td>" +
          "<td>" + gwChip(gwFull) + "</td>" +
          "<td>" +
          x1cell +
          "</td>" +
          '<td><button class="btn-del" type="button" data-del-id="' +
          esc(t.id) +
          '" title="Apagar">Apagar</button></td>' +
          "</tr>"
        );
      }

      function renderTxTable(rows, append) {
        indexTxList(rows, append);
        var body = document.getElementById("tx-body");
        var empty = document.getElementById("tx-empty");
        if (!body) return;
        if (!rows.length && !append) {
          body.innerHTML = "";
          if (empty) empty.hidden = false;
          return;
        }
        if (empty) empty.hidden = true;
        var chunk = rows.map(txRowHtml).join("");
        body.innerHTML = append ? body.innerHTML + chunk : chunk;
      }

      function updateTxFilterLabels(counts) {
        var sel = document.getElementById("tx-filter-status");
        if (!sel || !counts) return;
        var v = sel.value;
        sel.innerHTML =
          '<option value="pending">Pendentes (' +
          counts.pending +
          ")</option>" +
          '<option value="paid">Pagos (' +
          counts.paid +
          ")</option>" +
          '<option value="all">Todos (' +
          counts.total +
          ")</option>";
        sel.value = v === "paid" || v === "all" ? v : "pending";
      }

      function loadTransactions(reset) {
        if (currentPageName !== "sales") return;
        if (reset) txListOffset = 0;
        var statusEl = document.getElementById("tx-filter-status");
        var status = statusEl ? statusEl.value : "pending";
        var qEl = document.getElementById("tx-search");
        var q = qEl ? String(qEl.value || "").trim() : "";
        var limit = status === "pending" ? 5000 : 100;
        var qs =
          "?status=" +
          encodeURIComponent(status) +
          "&limit=" +
          limit +
          "&offset=" +
          txListOffset;
        if (q) qs += "&q=" + encodeURIComponent(q);
        if (lastRange) qs += "&from=" + lastRange.from + "&to=" + lastRange.to;
        var meta = document.getElementById("tx-list-meta");
        if (meta && reset) meta.textContent = "Carregando…";
        fetch("/api/admin/transactions" + qs, { headers: authHeaders() })
          .then(function (r) {
            if (r.status === 401) {
              showLogin(true);
              throw new Error("expired");
            }
            return r.json();
          })
          .then(function (j) {
            if (!j || !j.ok) {
              if (meta) meta.textContent = (j && j.error) || "Erro ao listar";
              return;
            }
            updateTxFilterLabels(j.counts);
            txListHasMore = !!j.has_more;
            var btnMore = document.getElementById("btn-tx-more");
            if (btnMore) btnMore.hidden = !txListHasMore;
            var rows = j.transactions || [];
            renderTxTable(rows, !reset);
            txListOffset += rows.length;
            if (meta) {
              meta.textContent =
                "Mostrando " +
                Math.min(j.filtered, txListOffset) +
                " de " +
                j.filtered +
                " neste filtro · " +
                j.counts.pending +
                " pendente(s) no total";
            }
            if (lastRange && j.counts) {
              document.getElementById("range-result").textContent =
                "Filtro de data ativo (" + lastRange.from + " → " + lastRange.to + ")";
            }
          })
          .catch(function (e) {
            if (e.message !== "expired" && meta) meta.textContent = "Falha ao carregar vendas";
          });
      }

      function loadStats() {
        var qs = "";
        if (lastRange) qs = "?from=" + lastRange.from + "&to=" + lastRange.to;
        fetch("/api/admin/stats" + qs, {
          headers: { Authorization: "Bearer " + token() },
        })
          .then(function (r) {
            if (r.status === 401) {
              showLogin(true);
              throw new Error("expired");
            }
            return r.json();
          })
          .then(function (d) {
            if (!d || d.error) {
              document.getElementById("updated").textContent = d && d.error ? d.error : "Erro nos dados";
              return;
            }
            var acc = d.account || {};
            document.getElementById("who").textContent = acc.name ? "· " + acc.name : "";

            /* Saldo disponível (c-saldo) */
            var displayBal = acc.balance_general != null ? acc.balance_general : acc.balance;
            var saldoEl = document.getElementById("c-saldo");
            if (saldoEl) {
              countUp(saldoEl, displayBal != null ? money(displayBal) : "—");
            }
            var saldoH = document.getElementById("c-saldo-h");
            if (saldoH) {
              if (acc.balance_breakdown) {
                saldoH.textContent = acc.balance_breakdown;
              } else if (acc.balance_note) {
                saldoH.textContent = acc.balance_note;
              } else if (acc.estimated) {
                saldoH.textContent = "estimado (API falhou — NÃO é o saldo real)";
              } else if (acc.cached) {
                saldoH.textContent = "disponível na conta (cache)";
              } else {
                saldoH.textContent = "disponível na conta";
              }
            }

            if (!d.periods || !d.pending_now) {
              document.getElementById("updated").textContent = "Resposta incompleta — atualize";
              return;
            }

            /* Faturamento (c-bruto) - gradient card */
            var tot = ((lastRange && d.range) ? d.range : d.periods.total);
            var brutoEl = document.getElementById("c-bruto");
            if (brutoEl) {
              countUp(brutoEl, money(tot.gross));
            }
            var brutoPill = document.getElementById("c-bruto-pill");
            if (brutoPill) {
              brutoPill.textContent = "↑ " + tot.paid_count + " aprovadas no período";
            }

            /* Vendas (c-sales-count + c-pend-qtd) */
            var salesCountEl = document.getElementById("c-sales-count");
            if (salesCountEl) {
              countUp(salesCountEl, String(tot.paid_count));
            }
            var pendForTot = tot.pending_count != null ? tot.pending_count : d.pending_now.count;
            var pendQtdEl = document.getElementById("c-pend-qtd");
            if (pendQtdEl) {
              pendQtdEl.textContent = pendForTot + " pendentes no período";
            }

            /* Ticket Médio (c-ticket) */
            var ticketEl = document.getElementById("c-ticket");
            if (ticketEl) {
              var ticketVal = tot.paid_count > 0 ? money(Math.round(tot.gross / tot.paid_count)) : "—";
              countUp(ticketEl, ticketVal);
            }

            /* Clientes (c-customers) - buscar transações pagas e contar distintos */
            fetch("/api/admin/transactions?status=paid&limit=500", {
              headers: authHeaders(),
            })
              .then(function (r) { return r.json(); })
              .then(function (txData) {
                var txs = txData.transactions || txData.list || [];
                var uniqueClients = {};
                txs.forEach(function (tx) {
                  var key = tx.client_name || tx.client_phone || tx.client_email || tx.id;
                  if (key) uniqueClients[key] = true;
                });
                var clientsEl = document.getElementById("c-customers");
                if (clientsEl) {
                  countUp(clientsEl, String(Object.keys(uniqueClients).length));
                }

                /* Produtos Mais Vendidos (top-products) */
                var productMap = {};
                txs.forEach(function (tx) {
                  var items = tx.items || tx.items_detail || [];
                  items.forEach(function (it) {
                    var name = it.variante || it.name || it.produto || "Produto";
                    var qty = Number(it.qtd || it.quantity || 1);
                    productMap[name] = (productMap[name] || 0) + qty;
                  });
                });
                var topProducts = Object.entries(productMap)
                  .sort(function (a, b) { return b[1] - a[1]; })
                  .slice(0, 5);
                var topEl = document.getElementById("top-products");
                if (topEl) {
                  if (!topProducts.length) {
                    topEl.innerHTML = '<div class="empty">Sem vendas no período</div>';
                  } else {
                    topEl.innerHTML = topProducts
                      .map(function (p, i) {
                        return (
                          '<div class="product-row">' +
                          '<div class="product-rank">' + (i + 1) + '</div>' +
                          '<div class="product-name">' + escapeHtml(p[0]) + '</div>' +
                          '<div class="product-qty">' + p[1] + ' un</div>' +
                          '</div>'
                        );
                      })
                      .join('');
                  }
                }
              })
              .catch(function () {});

            /* Performance bar chart (chart) */
            renderChart(d.daily || []);

            /* Aprovação donut (donut-fill, donut-text) */
            var paidCount = tot.paid_count;
            var pendCount = tot.pending_count != null ? tot.pending_count : d.pending_now.count;
            var totalTx = paidCount + pendCount;
            var approvalPct = totalTx > 0 ? Math.round((paidCount / totalTx) * 100) : 0;
            var donutFill = document.getElementById("donut-fill");
            if (donutFill) {
              var circumference = 314.16;
              var offset = circumference - (approvalPct / 100) * circumference;
              donutFill.style.strokeDashoffset = offset;
            }
            var donutText = document.getElementById("donut-text");
            if (donutText) {
              donutText.textContent = approvalPct + "%";
            }

            /* Métodos de Pagamento PIX (pm-pix-count) */
            var pmPixCount = document.getElementById("pm-pix-count");
            if (pmPixCount) {
              pmPixCount.textContent = paidCount;
            }

            /* som + aviso quando cair um pagamento */
            checkNewPaid(d.recent_preview || d.recent || []);

            /* Períodos (periods-grid) */
            document.getElementById("periods-grid").innerHTML =
              periodCard("Hoje", d.periods.hoje) +
              periodCard("Ontem", d.periods.ontem) +
              periodCard("Últimos 7 dias", d.periods.d7) +
              periodCard("Últimos 30 dias", d.periods.d30) +
              periodCard("Total", d.periods.total);

            /* Filtro personalizado (range-result) */
            if (d.range) {
              var rangePanel = document.getElementById("range-result-panel");
              if (rangePanel) rangePanel.hidden = false;
              document.getElementById("range-result").innerHTML =
                "<b style='color:var(--text)'>" + money(d.range.gross) + "</b> bruto · " +
                "<b style='color:var(--green)'>" + money(d.range.net) + "</b> líquido · " +
                d.range.paid_count + " vendas (" + d.range.from + " → " + d.range.to + ")";
            }

            var up = new Date(d.updated_at);
            document.getElementById("updated").textContent =
              "Atualizado " + up.toLocaleTimeString("pt-BR");
          })
          .catch(function (e) {
            if (e.message !== "expired") {
              document.getElementById("updated").textContent = "Falha ao atualizar";
            }
          });
      }

      function countUp(el, targetText) {
        el.textContent = targetText;
      }

      function escapeHtml(s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      /* ---------- gráfico 7 dias ---------- */
      var WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

      function renderChart(daily) {
        var box = document.getElementById("chart");
        if (!box) return;
        var W = 300, H = 84, PAD = 6;
        var max = 0;
        daily.forEach(function (d2) { if (d2.gross > max) max = d2.gross; });
        if (max <= 0) max = 1;
        var n = daily.length || 1;
        var pts = daily.map(function (d2, i2) {
          var x = PAD + (i2 * (W - PAD * 2)) / Math.max(1, n - 1);
          var y = H - PAD - (d2.gross / max) * (H - PAD * 2);
          return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
        });
        var line = pts.map(function (p2, i2) { return (i2 ? "L" : "M") + p2[0] + " " + p2[1]; }).join(" ");
        var area = line + " L" + pts[pts.length - 1][0] + " " + (H - 2) + " L" + pts[0][0] + " " + (H - 2) + " Z";
        var todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        var dots = pts.map(function (p2, i2) {
          return '<circle cx="' + p2[0] + '" cy="' + p2[1] + '" r="3" fill="#fff" stroke="var(--pink)" stroke-width="1.5"><title>' + (daily[i2].gross > 0 ? money(daily[i2].gross) : "R$ 0") + "</title></circle>";
        }).join("");
        var labels = daily.map(function (d2) {
          var dt = new Date(d2.date + "T12:00:00");
          return '<span class="lc-lbl' + (d2.date === todayStr ? " today" : "") + '">' + WEEKDAYS[dt.getDay()] + " " + dt.getDate() + "</span>";
        }).join("");
        box.innerHTML =
          '<svg class="lc-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' +
          '<defs><linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="var(--pink)" stop-opacity="0.35"/>' +
          '<stop offset="100%" stop-color="var(--pink)" stop-opacity="0"/>' +
          "</linearGradient></defs>" +
          '<path class="lc-area" d="' + area + '" fill="url(#lc-grad)"/>' +
          '<path class="lc-line" d="' + line + '"/>' +
          dots +
          "</svg>" +
          '<div class="lc-labels">' + labels + "</div>";
      }

      /* ---------- som + aviso de pagamento confirmado ---------- */
      var knownPaid = null;

      function playCashSound() {
        try {
          var ctx = new (window.AudioContext || window.webkitAudioContext)();
          var t0 = ctx.currentTime;
          [[880, 0], [1174.66, 0.12]].forEach(function (note) {
            var o = ctx.createOscillator();
            var g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = "sine";
            o.frequency.value = note[0];
            g.gain.setValueAtTime(0.0001, t0 + note[1]);
            g.gain.exponentialRampToValueAtTime(0.3, t0 + note[1] + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + note[1] + 0.45);
            o.start(t0 + note[1]);
            o.stop(t0 + note[1] + 0.5);
          });
        } catch (e) {}
      }

      function adminToast(msg) {
        var el = document.createElement("div");
        el.className = "admin-toast";
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(function () {
          el.remove();
        }, 5000);
      }

      function checkNewPaid(recent) {
        var paidNow = {};
        recent.forEach(function (t) {
          if (t.status === "paid") paidNow[t.id] = t;
        });
        if (knownPaid !== null) {
          Object.keys(paidNow).forEach(function (id) {
            if (!knownPaid[id]) {
              var t = paidNow[id];
              playCashSound();
              adminToast("Pix pago! " + money(t.amount) + " — " + (t.client_name || "cliente"));
            }
          });
        }
        knownPaid = paidNow;
      }

      /* ---------- exportar CSV ---------- */
      document.getElementById("btn-csv").addEventListener("click", function () {
        fetch("/api/admin/export", {
          headers: { Authorization: "Bearer " + token() },
        })
          .then(function (r) {
            if (!r.ok) throw new Error("erro");
            return r.blob();
          })
          .then(function (blob) {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "vendas-panelas.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
          })
          .catch(function () {
            adminToast("Falha ao exportar CSV");
          });
      });

      /* ---------- modal de detalhes ---------- */
      var txModal = document.getElementById("tx-modal");
      var modalBody = document.getElementById("modal-body");
      var currentTx = null;

      function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
      }

      function row(label, value) {
        return (
          '<div class="info-row"><span>' + label + "</span><b>" +
          (value ? esc(value) : "—") + "</b></div>"
        );
      }

      function fullAddress(t) {
        var a = t.address || {};
        if (!a.rua && !a.cidade) return "";
        return (
          a.rua + ", " + a.numero +
          (a.complemento ? ", " + a.complemento : "") +
          " — " + a.bairro + ", " + a.cidade + "/" + a.uf +
          " — CEP " + a.cep
        );
      }

      function openTxModal(t) {
        currentTx = t;
        var a = t.address || {};
        var dt = new Date(t.created_at);
        var itens = (t.items_detail || [])
          .map(function (it) {
            return it.qtd + "x " + it.variante;
          })
          .join(" · ");

        modalBody.innerHTML =
          '<div class="info-sec"><h4>Pedido</h4>' +
          row("Status", { paid: "Pago", pending: "Pendente", expired: "Expirado", failed: "Falhou" }[t.status] || t.status) +
          row("Valor", money(t.amount)) +
          row("Líquido (após taxas)", t.net != null ? money(t.net) : "—") +
          row("Itens", itens) +
          row("Data", dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR")) +
          row("ID / Gateway", (t.gateway || "—") + " · " + t.id) +
          "</div>" +
          '<div class="info-sec"><h4>Cliente</h4>' +
          row("Nome", t.client_name) +
          row("Telefone", t.client_phone ? "(+55) " + t.client_phone : "") +
          row("E-mail", t.client_email) +
          row("CPF", t.client_doc) +
          "</div>" +
          '<div class="info-sec"><h4>Endereço de envio</h4>' +
          row("CEP", a.cep) +
          row("Rua", a.rua) +
          row("Número", a.numero) +
          row("Complemento", a.complemento) +
          row("Bairro", a.bairro) +
          row("Cidade / UF", a.cidade ? a.cidade + " / " + a.uf : "") +
          "</div>";

        txModal.hidden = false;
      }

      document.getElementById("tx-body").addEventListener("click", function (e) {
        /* apagar venda */
        var delBtn = e.target.closest(".btn-del");
        if (delBtn) {
          e.stopPropagation();
          var delId = delBtn.getAttribute("data-del-id");
          var dtx = delId ? lastRecentById[delId] : null;
          if (!dtx) return;
          if (!confirm("Apagar a venda de " + (dtx.client_name || "cliente") + " (" + money(dtx.amount) + ")?")) return;
          delBtn.disabled = true;
          fetch("/api/admin/tx-delete", {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ id: dtx.id }),
          })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (j.ok) {
                adminToast("Venda apagada");
                loadStats();
                loadTransactions(true);
              } else {
                delBtn.disabled = false;
                adminToast(j.error || "Falha ao apagar");
              }
            })
            .catch(function () {
              delBtn.disabled = false;
              adminToast("Falha ao apagar");
            });
          return;
        }

        /* botão X1: marca/desmarca sem abrir o modal */
        var x1btn = e.target.closest(".btn-x1");
        if (x1btn) {
          e.stopPropagation();
          var x1Id = x1btn.getAttribute("data-x1-id");
          var tx = x1Id ? lastRecentById[x1Id] : null;
          if (!tx) return;
          var done = !tx.x1;
          x1btn.disabled = true;
          fetch("/api/admin/x1", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token(),
            },
            body: JSON.stringify({ id: tx.id, done: done }),
          })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              x1btn.disabled = false;
              if (j.ok) {
                tx.x1 = j.x1;
                x1btn.classList.toggle("done", j.x1);
                x1btn.textContent = j.x1 ? "X1 FEITO" : "MARCAR X1";
              }
            })
            .catch(function () {
              x1btn.disabled = false;
            });
          return;
        }

        var tr = e.target.closest("tr[data-tx-id]");
        if (!tr) return;
        var tid = tr.getAttribute("data-tx-id");
        var t = tid ? lastRecentById[tid] : null;
        if (t) openTxModal(t);
      });

      document.getElementById("modal-close").addEventListener("click", function () {
        txModal.hidden = true;
      });
      txModal.addEventListener("click", function (e) {
        if (e.target === txModal) txModal.hidden = true;
      });

      document.getElementById("btn-copy-envio").addEventListener("click", function () {
        if (!currentTx) return;
        var t = currentTx;
        var itens = (t.items_detail || [])
          .map(function (it) {
            return it.qtd + "x " + it.variante;
          })
          .join("\n");
        var texto =
          "PEDIDO — " + money(t.amount) + "\n" +
          (itens ? itens + "\n\n" : "\n") +
          "Nome: " + (t.client_name || "") + "\n" +
          "Telefone: " + (t.client_phone ? "(+55) " + t.client_phone : "") + "\n" +
          "CPF: " + (t.client_doc || "") + "\n" +
          "Endereço: " + fullAddress(t);
        navigator.clipboard.writeText(texto).then(function () {
          var btn = document.getElementById("btn-copy-envio");
          btn.textContent = "Copiado!";
          setTimeout(function () {
            btn.textContent = "Copiar dados de envio";
          }, 1600);
        });
      });

      /* ---------- overview: pills Hoje / 7 dias / 30 dias ---------- */
      function ymdRange(offsetDays) {
        return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * 86400000));
      }
      function applyRangePills(days) {
        document.querySelectorAll(".date-pill").forEach(function (b) {
          b.classList.toggle("active", String(b.getAttribute("data-days")) === String(days));
        });
      }
      function setRangeDays(days) {
        try { localStorage.setItem("admin_range", String(days)); } catch (e) {}
        lastRange = { from: ymdRange(-(days - 1)), to: ymdRange(0) };
        applyRangePills(days);
        var lab0 = document.getElementById("custom-range-label");
  if (lab0) lab0.textContent = "Personalizado";
  loadStats();
      }
      document.querySelectorAll(".date-pill").forEach(function (b) {
        b.addEventListener("click", function () {
          setRangeDays(parseInt(b.getAttribute("data-days"), 10) || 7);
        });
      });
      (function initRangePills() {
        var saved = 7;
        try { saved = parseInt(localStorage.getItem("admin_range"), 10) || 7; } catch (e) {}
        applyRangePills(saved);
        lastRange = { from: ymdRange(-(saved - 1)), to: ymdRange(0) };
      })();

      bootSession();

      /* ---------- SSE: pessoas online em tempo real ---------- */
      var onlineEl = (document.getElementById("c-online") || document.getElementById("online-split-counts"));
      var onlinePagesStoreEl = document.getElementById("online-pages-store");
      var onlinePagesCloakerEl = document.getElementById("online-pages-cloaker");
      var onlineSplitCountsEl = document.getElementById("online-split-counts");
      var onlineSSE;
      function escapeHtml(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function renderOnlineList(el, pages, emptyMsg, tagClass, tagLabel) {
        if (!el) return;
        var list = Array.isArray(pages) ? pages : [];
        if (!list.length) {
          el.innerHTML = '<li class="op-empty">' + escapeHtml(emptyMsg) + "</li>";
          return;
        }
        el.innerHTML = list
          .map(function (row) {
            var url = escapeHtml(row && row.url ? row.url : "?");
            var n = Number(row && row.count) || 0;
            return (
              '<li><span class="' +
              tagClass +
              '">' +
              tagLabel +
              '</span><span class="op-url">' +
              url +
              '</span><span class="op-count">' +
              n +
              "</span></li>"
            );
          })
          .join("");
      }
      function filterByHostname(pages) {
        var host = String(window.location.hostname || "").toLowerCase();
        if (!host || host === "localhost" || host === "127.0.0.1") return pages;
        return (pages || []).filter(function(row) {
          var url = String(row && row.url ? row.url : "").toLowerCase();
          // Se é caminho relativo (começa com /), inclui
          if (url.startsWith("/")) return true;
          // Se contém o hostname atual, inclui
          if (url.indexOf(host) !== -1) return true;
          // Caso contrário, filtra
          return false;
        });
      }
      function renderOnlinePages(d) {
        var counts = (d && d.counts) || {};
        var storePages = filterByHostname((d && d.pages_store) || []);
        var cloakPages = filterByHostname((d && d.pages_cloaker) || []);
        if (onlineSplitCountsEl) {
          onlineSplitCountsEl.textContent =
            "Loja: " + storePages.length + " · Cloaker: " + cloakPages.length;
        }
        renderOnlineList(
          onlinePagesStoreEl,
          storePages,
          "Ninguém na vitrine",
          "op-tag-store",
          "LOJA"
        );
        renderOnlineList(
          onlinePagesCloakerEl,
          cloakPages,
          "Ninguém no cloaker",
          "op-tag-cloak",
          "CLOAK"
        );
      }
      function connectOnlineSSE() {
        try {
          if (onlineSSE) onlineSSE.close();
        } catch (e) {}
        onlineSSE = new EventSource("/api/admin/online");
        onlineSSE.onmessage = function (ev) {
          try {
            var d = JSON.parse(ev.data);
            if (d.online != null && onlineEl) {
              onlineEl.textContent = d.online;
            }
            renderOnlinePages(d);
          } catch (e2) {}
        };
        onlineSSE.onerror = function () {
          try {
            onlineSSE.close();
          } catch (e3) {}
          setTimeout(connectOnlineSSE, 4000);
        };
      }
    
/* ---------- filtro personalizado (popover + calendario customizado) ---------- */
function fmtBR(ymd) {
  var pp = String(ymd || "").split("-");
  return pp.length === 3 ? pp[2] + "/" + pp[1] : ymd;
}
function applyCustomRange(from, to, label) {
  lastRange = { from: from, to: to };
  applyRangePills(-1);
  var lab = document.getElementById("custom-range-label");
  if (lab) lab.textContent = label || (fmtBR(from) + " – " + fmtBR(to));
  var pop = document.getElementById("range-pop");
  if (pop) pop.hidden = true;
  loadStats();
}
(function wireCustomRange() {
  var btn = document.getElementById("btn-custom-range");
  var pop = document.getElementById("range-pop");
  if (!btn || !pop) return;
  var calBox = document.getElementById("range-cal");
  var selLabel = document.getElementById("range-sel-label");
  var calBase = new Date();
  calBase = new Date(calBase.getFullYear(), calBase.getMonth(), 1);
  var selFrom = null, selTo = null;
  var MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  function ymd(d) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function renderCal() {
    if (!calBox) return;
    var y = calBase.getFullYear(), m = calBase.getMonth();
    var startDow = new Date(y, m, 1).getDay();
    var daysIn = new Date(y, m + 1, 0).getDate();
    var todayStr = ymd(new Date());
    var cells = "";
    for (var i = 0; i < 42; i++) {
      var dayNum = i - startDow + 1;
      var dObj = new Date(y, m, dayNum);
      var ds = ymd(dObj);
      var cls = "";
      if (dayNum < 1 || dayNum > daysIn) cls += " out";
      if (ds === todayStr) cls += " today";
      if (selFrom === ds || selTo === ds) cls += " sel";
      else if (selFrom && selTo && ds > selFrom && ds < selTo) cls += " inr";
      cells += '<button type="button" data-d="' + ds + '" class="' + cls.trim() + '">' + dObj.getDate() + "</button>";
    }
    calBox.innerHTML =
      '<div class="range-cal-head"><b>' + MONTHS[m] + " de " + y + '</b><div class="range-cal-nav">' +
      '<button type="button" data-nav="-1" aria-label="Mês anterior">‹</button>' +
      '<button type="button" data-nav="1" aria-label="Próximo mês">›</button></div></div>' +
      '<div class="range-cal-week"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>' +
      '<div class="range-cal-grid">' + cells + "</div>";
  }
  function updLabel() {
    if (!selLabel) return;
    selLabel.textContent =
      selFrom && selTo ? fmtBR(selFrom) + " – " + fmtBR(selTo)
      : selFrom ? "De " + fmtBR(selFrom) + " — clique no dia final"
      : "Selecione as datas";
  }
  function closePop() { pop.hidden = true; }
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (pop.hidden) { pop.hidden = false; renderCal(); updLabel(); }
    else closePop();
  });
  var closeBtn = document.getElementById("range-close");
  if (closeBtn) closeBtn.addEventListener("click", closePop);
  document.addEventListener("click", function (e) {
    if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) closePop();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });
  pop.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var nav = t.closest("[data-nav]");
    if (nav) {
      calBase = new Date(calBase.getFullYear(), calBase.getMonth() + parseInt(nav.getAttribute("data-nav"), 10), 1);
      renderCal();
      return;
    }
    var day = t.closest("[data-d]");
    if (day) {
      var ds = day.getAttribute("data-d");
      if (!selFrom || (selFrom && selTo)) { selFrom = ds; selTo = null; }
      else if (ds < selFrom) { selTo = selFrom; selFrom = ds; }
      else { selTo = ds; }
      renderCal(); updLabel();
    }
  });
  pop.querySelectorAll(".range-preset").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.getAttribute("data-preset");
      var from, to, label;
      if (k === "hoje") { from = ymdRange(0); to = from; label = "Hoje"; }
      else if (k === "ontem") { from = ymdRange(-1); to = from; label = "Ontem"; }
      else if (k === "semana") {
        var offMon = (new Date().getDay() + 6) % 7;
        from = ymdRange(-offMon); to = ymdRange(0); label = "Esta semana";
      } else if (k === "mes") {
        var d = new Date();
        from = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
        to = ymdRange(0); label = "Este mês";
      } else {
        var n = parseInt(k, 10) || 7;
        from = ymdRange(-(n - 1)); to = ymdRange(0); label = "Últimos " + n + " dias";
      }
      pop.querySelectorAll(".range-preset").forEach(function (x) { x.classList.toggle("active", x === b); });
      applyCustomRange(from, to, label);
    });
  });
  var applyBtn = document.getElementById("btn-ov-apply");
  if (applyBtn) applyBtn.addEventListener("click", function () {
    if (!selFrom) return;
    applyCustomRange(selFrom, selTo || selFrom, null);
  });
})();

/* ---------- ocultar / mostrar valores ---------- */
(function wireHideValues() {
  var btn = document.getElementById("btn-hide-values");
  var lab = document.getElementById("hide-values-label");
  if (!btn) return;
  function set(h) {
    document.body.classList.toggle("hide-values", h);
    try { localStorage.setItem("admin_hide_values", h ? "1" : "0"); } catch (e) {}
    if (lab) lab.textContent = h ? "Mostrar valores" : "Ocultar valores";
  }
  var saved = false;
  try { saved = localStorage.getItem("admin_hide_values") === "1"; } catch (e) {}
  set(saved);
  btn.addEventListener("click", function () {
    set(!document.body.classList.contains("hide-values"));
  });
})();

      /* ---------- recuperar vendas perdidas direto dos gateways ---------- */
      (function wireImportGatewaySales() {
        var btn = document.getElementById("btn-rc-import");
        if (!btn) return;
        btn.addEventListener("click", function () {
          var st = document.getElementById("rc-status");
          if (st) { st.textContent = "Recuperando vendas dos gateways…"; st.className = "pixel-status"; }
          fetch("/api/admin/import-gateway-sales", { method: "POST", headers: authHeaders() })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (st) {
                st.textContent = j && j.ok
                  ? "Recuperado: " + j.imported + " venda(s) nova(s), " + j.updated + " atualizada(s) · total " + j.total_tx + (j.notes && j.notes.length ? " · " + j.notes.join(" | ") : "")
                  : "Falha ao recuperar: " + ((j && j.error) || "erro");
              }
              loadTransactions(true);
            })
            .catch(function () { if (st) st.textContent = "Erro ao recuperar vendas."; });
        });
      })();
})();

