(function () {
  "use strict";

  // Auth helpers - same pattern as admin.js
  function token() {
    try {
      return sessionStorage.getItem("admin_token") || localStorage.getItem("admin_token") || "";
    } catch (e) {
      return "";
    }
  }

  function authHeaders(extra) {
    var t = token();
    var h = {};
    if (t) h.Authorization = "Bearer " + t;
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k)) h[k] = extra[k];
      }
    }
    return h;
  }

  // Toast helper
  function toast(msg, type) {
    var el = document.createElement("div");
    el.className = "cp-toast" + (type ? " " + type : "");
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 3000);
  }

  // Copy to clipboard with fallback
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Copiado", "success");
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("Copiado", "success");
    } catch (e) {
      toast("Falha ao copiar", "error");
    }
    document.body.removeChild(ta);
  }

  // Escape HTML
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // State
  var campaigns = [];
  var editingId = null;
  var stats = null;

  // API calls
  function fetchCampaigns() {
    return fetch("/api/admin/campaigns", { headers: authHeaders() })
      .then(function (r) {
        if (r.status === 401) {
          toast("Sessão expirada", "error");
          throw new Error("expired");
        }
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Falha ao carregar");
        campaigns = j.campaigns || [];
        return campaigns;
      });
  }

  function fetchStats() {
    return fetch("/api/admin/campaigns/stats?days=7", { headers: authHeaders() })
      .then(function (r) {
        if (r.status === 401) throw new Error("expired");
        return r.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Falha ao carregar stats");
        stats = j;
        return stats;
      });
  }

  function createCampaign(data) {
    return fetch("/api/admin/campaigns", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(data)
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Falha ao criar");
        return j.campaign;
      });
  }

  function updateCampaign(id, data) {
    return fetch("/api/admin/campaigns/update", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(Object.assign({ id: id }, data))
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Falha ao atualizar");
        return j.campaign;
      });
  }

  function deleteCampaign(id) {
    return fetch("/api/admin/campaigns/delete", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: id })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Falha ao deletar");
      });
  }

  function toggleCampaign(id, enabled) {
    return fetch("/api/admin/campaigns/toggle", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: id, enabled: enabled })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Falha ao alternar");
        return j.enabled;
      });
  }

  function regenToken(id) {
    return fetch("/api/admin/campaigns/regen-token", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: id })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Falha ao regenerar");
        return j.token;
      });
  }

  // Render list view
  function renderList() {
    var container = document.getElementById("cloakerpro-container");
    if (!container) return;

    var html = '<div class="cp-header"><div class="cp-header-left">';
    html += '<h1>Cloaker Pro</h1>';
    html += '<p class="subtitle">Campanhas com cloaking server-side — safe page, offer page e filtragem total</p>';
    html += '</div>';
    html += '<button class="btn-purple" id="cp-btn-new">+ Nova campanha</button>';
    html += '</div>';

    // Stats tiles
    html += '<div class="cp-stats-row">';
    html += renderStatTile("blue", "Requisições", stats && stats.totals ? stats.totals.requests : 0);
    html += renderStatTile("purple", "Offer page", stats && stats.totals ? stats.totals.offer : 0);
    html += renderStatTile("green", "Safe page", stats && stats.totals ? stats.totals.safe : 0);
    html += renderStatTile("orange", "Bots", stats && stats.totals ? stats.totals.bots : 0);
    html += '</div>';

    // Chart
    html += '<div class="cp-chart-card">';
    html += '<h2 style="font-size:18px;font-weight:600;color:#fff;margin:0 0 20px 0">Últimos 7 dias</h2>';
    html += '<div class="cp-chart-container">';
    html += renderChart();
    html += '</div></div>';

    // Table
    html += '<div class="cp-table-card">';
    html += '<h2>Top campanhas</h2>';
    if (campaigns.length === 0) {
      html += '<div class="cp-empty-state"><p>Nenhuma campanha ainda — crie a primeira</p></div>';
    } else {
      html += '<table class="cp-table">';
      html += '<thead><tr>';
      html += '<th>Nome</th><th>Hash</th><th>Offer</th><th>Safe</th><th>Bots</th><th>Status</th><th>Ações</th>';
      html += '</tr></thead><tbody>';
      campaigns.forEach(function (c) {
        var cStat = stats && stats.perCampaign ? stats.perCampaign.find(function (s) { return s.id === c.id; }) : null;
        html += '<tr data-id="' + c.id + '">';
        html += '<td>' + renderSourceChip(c.source) + ' ' + esc(c.name) + '</td>';
        html += '<td><div class="hash-chip">' + esc(c.slug) + '<button class="copy-btn" data-copy="' + esc(c.slug) + '">' + copyIcon() + '</button></div></td>';
        html += '<td>' + (cStat ? cStat.offer : 0) + '</td>';
        html += '<td>' + (cStat ? cStat.safe : 0) + '</td>';
        html += '<td>' + (cStat ? cStat.bots : 0) + '</td>';
        html += '<td><span class="status-badge ' + (c.enabled ? 'active' : 'inactive') + '">' + (c.enabled ? 'Ativa' : 'Desativada') + '</span></td>';
        html += '<td>';
        if (String(c.source || "").toLowerCase() === "tiktok") {
          var ttOn = !!(c.filters && c.filters.ttclidBypass);
          html += '<button class="ttclid-btn' + (ttOn ? " on" : "") + '" type="button" data-ttclid-id="' + c.id + '" title="' + (ttOn ? "ttclid ATIVADO: cliques pagos do TikTok passam direto" : "ttclid DESATIVADO: cliques pagos tambem sao filtrados") + '">ttclid ' + (ttOn ? "ON" : "OFF") + "</button>";
        }
        var capOn = !!(c.filters && (c.filters.captcha || c.filters.captchaEnabled));
        html += '<button class="captcha-btn' + (capOn ? " on" : "") + '" type="button" data-captcha-id="' + c.id + '" title="' + (capOn ? "Captcha ATIVADO: desafio de imagens antes da Offer" : "Captcha DESATIVADO: entra direto na Offer") + '">Captcha ' + (capOn ? "ON" : "OFF") + "</button>";
        html += '<button class="action-btn btn-edit" data-id="' + c.id + '" title="Editar">' + editIcon() + '</button>';
        html += '<label class="toggle-switch"><input type="checkbox" class="toggle-enabled" data-id="' + c.id + '"' + (c.enabled ? ' checked' : '') + '><span class="toggle-slider"></span></label>';
        html += '<button class="action-btn btn-delete" data-id="' + c.id + '" title="Deletar">' + deleteIcon() + '</button>';
        html += '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    container.innerHTML = html;

    // Event listeners
    document.getElementById("cp-btn-new").addEventListener("click", function () {
      openEditor(null);
    });

    container.querySelectorAll(".copy-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(btn.getAttribute("data-copy"));
      });
    });

    container.querySelectorAll(".ttclid-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-ttclid-id");
        var camp = null;
        for (var i2 = 0; i2 < campaigns.length; i2++) if (campaigns[i2].id === id) camp = campaigns[i2];
        if (!camp) return;
        var f = camp.filters || {};
        var next = !f.ttclidBypass;
        var nf = {};
        for (var k2 in f) if (f.hasOwnProperty(k2)) nf[k2] = f[k2];
        nf.ttclidBypass = next;
        updateCampaign(id, { filters: nf }).then(function () {
          toast(next ? "ttclid ATIVADO — cliques pagos passam direto" : "ttclid DESATIVADO — cliques pagos também serão filtrados", "success");
          loadList();
        });
      });
    });

    container.querySelectorAll(".captcha-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-captcha-id");
        var camp = null;
        for (var i2 = 0; i2 < campaigns.length; i2++) if (campaigns[i2].id === id) camp = campaigns[i2];
        if (!camp) return;
        var f = camp.filters || {};
        var next = !(f.captcha || f.captchaEnabled);
        var nf = {};
        for (var k2 in f) if (f.hasOwnProperty(k2)) nf[k2] = f[k2];
        nf.captcha = next;
        nf.captchaEnabled = next;
        updateCampaign(id, { filters: nf }).then(function () {
          toast(next ? "Captcha Anti-Bot ATIVADO — desafio de imagens antes da Offer" : "Captcha Anti-Bot DESATIVADO — entra direto na Offer", "success");
          loadList();
        });
      });
    });
    container.querySelectorAll(".btn-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        var c = campaigns.find(function (x) { return x.id === id; });
        if (c) openEditor(c);
      });
    });

    container.querySelectorAll(".btn-delete").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (!confirm("Tem certeza que deseja deletar esta campanha?")) return;
        btn.disabled = true;
        deleteCampaign(id)
          .then(function () {
            toast("Campanha deletada", "success");
            loadList();
          })
          .catch(function (e) {
            btn.disabled = false;
            toast(e.message || "Falha ao deletar", "error");
          });
      });
    });

    container.querySelectorAll(".toggle-enabled").forEach(function (toggle) {
      toggle.addEventListener("change", function () {
        var id = toggle.getAttribute("data-id");
        var enabled = toggle.checked;
        toggle.disabled = true;
        toggleCampaign(id, enabled)
          .then(function (newEnabled) {
            toggle.disabled = false;
            var c = campaigns.find(function (x) { return x.id === id; });
            if (c) c.enabled = newEnabled;
            toast("Status atualizado", "success");
            loadList();
          })
          .catch(function (e) {
            toggle.disabled = false;
            toggle.checked = !enabled;
            toast(e.message || "Falha ao alternar", "error");
          });
      });
    });
  }

  function renderStatTile(color, label, value) {
    return '<div class="cp-stat-tile">' +
      '<div class="stat-label"><span class="stat-dot ' + color + '"></span>' + esc(label) + '</div>' +
      '<div class="stat-value">' + (value || 0) + '</div>' +
      '</div>';
  }

  function renderChart() {
    if (!stats || !stats.series || stats.series.length === 0) {
      return '<p style="color:#a1a1aa;text-align:center;padding:40px">Sem dados para o gráfico</p>';
    }

    var series = stats.series;
    var maxVal = 0;
    series.forEach(function (d) {
      var total = d.requests + d.offer + d.safe + d.bots;
      if (total > maxVal) maxVal = total;
    });

    var width = 800;
    var height = 300;
    var padding = 40;
    var chartWidth = width - padding * 2;
    var chartHeight = height - padding * 2;

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">';
    svg += '<stop offset="0%" stop-color="#ff2e88" stop-opacity="0.3"/>';
    svg += '<stop offset="100%" stop-color="#ff2e88" stop-opacity="0"/>';
    svg += '</linearGradient></defs>';

    // Grid lines
    for (var i = 0; i <= 4; i++) {
      var y = padding + (chartHeight / 4) * i;
      svg += '<line x1="' + padding + '" y1="' + y + '" x2="' + (width - padding) + '" y2="' + y + '" stroke="#232329" stroke-width="1"/>';
    }

    // Path for total requests
    var points = [];
    series.forEach(function (d, idx) {
      var x = padding + (chartWidth / (series.length - 1)) * idx;
      var total = d.requests + d.offer + d.safe + d.bots;
      var y = padding + chartHeight - (maxVal > 0 ? (total / maxVal) * chartHeight : 0);
      points.push(x + ',' + y);
    });

    // Area fill
    var pathD = 'M' + points.join(' L') + ' L' + (padding + chartWidth) + ',' + (padding + chartHeight) + ' L' + padding + ',' + (padding + chartHeight) + ' Z';
    svg += '<path d="' + pathD + '" fill="url(#chartGradient)"/>';

    // Line
    svg += '<path d="M' + points.join(' L') + '" fill="none" stroke="#ff2e88" stroke-width="2"/>';

    // Dots
    series.forEach(function (d, idx) {
      var x = padding + (chartWidth / (series.length - 1)) * idx;
      var total = d.requests + d.offer + d.safe + d.bots;
      var y = padding + chartHeight - (maxVal > 0 ? (total / maxVal) * chartHeight : 0);
      svg += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="#ff2e88"/>';
    });

    // X-axis labels (first and last)
    if (series.length > 0) {
      var firstDate = new Date(series[0].d);
      var lastDate = new Date(series[series.length - 1].d);
      svg += '<text x="' + padding + '" y="' + (height - 10) + '" fill="#a1a1aa" font-size="12">' + firstDate.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' }) + '</text>';
      svg += '<text x="' + (width - padding) + '" y="' + (height - 10) + '" fill="#a1a1aa" font-size="12" text-anchor="end">' + lastDate.toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit' }) + '</text>';
    }

    svg += '</svg>';
    return svg;
  }

  function renderSourceChip(source) {
    var icons = {
      tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005.8 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1.84-.1z"/></svg>',
      facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
      google: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>',
      native: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
      other: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>'
    };
    var icon = icons[source] || icons.other;
    return '<span class="source-chip">' + icon + esc(source) + '</span>';
  }

  function copyIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  }

  function editIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  }

  function deleteIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
  }

  // Render editor view
  function renderEditor(campaign) {
    var container = document.getElementById("cloakerpro-container");
    if (!container) return;

    var c = campaign || {
      name: "",
      slug: "",
      token: "",
      tokenEnabled: true,
      source: "tiktok",
      domain: "*",
      entryStore: "panelas",
      enabled: true,
      safe: { method: "redirect", url: "" },
      offer: { method: "internal", type: "single", urls: ["/sabonete/"] },
      targeting: { device: "all", countryMode: "off", countries: [] },
      filters: {
        botUa: true,
        automation: true,
        softwareGl: true,
        desktopLike: true,
        datacenterIp: true,
        proxy: true,
        tor: false,
        ttclidBypass: true
      }
    };

    var html = '<div class="cp-editor">';
    html += '<div class="cp-editor-header">';
    html += '<button class="btn-ghost" id="cp-btn-back">← Voltar</button>';
    html += '<button class="btn-white" id="cp-btn-save">Salvar</button>';
    html += '</div>';

    html += '<div class="cp-editor-grid">';

    // LEFT COLUMN
    html += '<div>';

    // Card: Informações básicas
    html += '<div class="cp-card">';
    html += '<div class="cp-card-header">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    html += '<h3>Informações básicas</h3>';
    html += '<p class="card-help"><b>Nome</b> = identificação interna no painel. <b>Domínio</b> = onde o link /c/… vale (use * pra aceitar qualquer domínio). <b>Fonte de tráfego</b> = plataforma do anúncio. <b>Loja de destino</b> = qual loja é servida como OFFER pra quem passa dos filtros.</p>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Nome da campanha<span class="required">*</span></label>';
    html += '<input type="text" class="form-input" id="cp-name" value="' + esc(c.name) + '" placeholder="Minha Campanha TikTok" />';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Domínio<span class="required">*</span></label>';
    html += '<input type="text" class="form-input" id="cp-domain" value="' + esc(c.domain) + '" placeholder="ofertasdemocas.vercel.app" />';
    html += '<p class="form-hint">use * para qualquer domínio</p>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Fonte de tráfego<span class="required">*</span></label>';
    html += '<select class="form-select" id="cp-source">';
    ['tiktok', 'facebook', 'google', 'native', 'other'].forEach(function (s) {
      html += '<option value="' + s + '"' + (c.source === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Loja de destino</label>';
    html += '<select class="form-select" id="cp-entryStore">';
    var stores = [
      { val: 'jaqueta', label: 'Jaqueta Puffer' },
      { val: 'toalha', label: 'Kit Toalhas' },
      { val: 'bobojaco', label: 'Bobojaco' },
      { val: 'roupao', label: 'Roupão plush' },
      { val: 'teddy', label: 'Casaquinho Teddy' },
      { val: 'sabonete', label: 'Kit Sabonete' },
      { val: 'panelas', label: 'Panelas' },
      { val: 'conjunto', label: 'Conjunto Alfaiataria' }
    ];
    stores.forEach(function (s) {
      html += '<option value="' + s.val + '"' + (c.entryStore === s.val ? ' selected' : '') + '>' + s.label + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '</div>';

    // Card: Segmentação de público
    html += '<div class="cp-card">';
    html += '<div class="cp-card-header">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
    html += '<h3>Segmentação de público</h3>';
    html += '<p class="card-help"><b>Dispositivo</b>: Nenhum / Todos = sem filtro de dispositivo (celular e PC entram normalmente na offer); Mobile = apenas celular passa (PC vai pra safe); Desktop = apenas PC passa. <b>País</b>: Sem filtro = qualquer país; Permitir apenas = só os códigos listados veem a offer; Bloquear = os listados vão pra safe page. Códigos ISO separados por vírgula (BR, AR, US).</p>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Dispositivo</label>';
    html += '<select class="form-select" id="cp-device">';
    [['none', 'Nenhum (Todos os dispositivos)'], ['all', 'Todos'], ['mobile', 'Apenas Mobile (Celular)'], ['desktop', 'Apenas Desktop (Computador)']].forEach(function (d) {
      html += '<option value="' + d[0] + '"' + (c.targeting.device === d[0] ? ' selected' : '') + '>' + d[1] + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">País</label>';
    html += '<select class="form-select" id="cp-countryMode">';
    [['off', 'Sem filtro'], ['allow', 'Permitir apenas'], ['block', 'Bloquear']].forEach(function (m) {
      html += '<option value="' + m[0] + '"' + (c.targeting.countryMode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '<div class="form-group" id="cp-countries-group"' + (c.targeting.countryMode === 'off' ? ' style="display:none"' : '') + '>';
    html += '<label class="form-label">Códigos de país</label>';
    html += '<input type="text" class="form-input" id="cp-countries" value="' + esc((c.targeting.countries || []).join(', ')) + '" placeholder="BR, AR" />';
    html += '<p class="form-hint">Separe por vírgula (ex: BR, AR, US)</p>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // end left column

    // RIGHT COLUMN
    html += '<div>';

    // Card: Safe Page
    html += '<div class="cp-card">';
    html += '<div class="cp-card-header">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    html += '<h3>Safe Page</h3>';
    html += '<p class="card-help">Página mostrada pra quem NÃO passa nos filtros (bot, revisão, PC, datacenter…). <b>Redirect</b> = redireciona 302 pra URL segura. <b>Mirror</b> = serve a safe page no SEU domínio via proxy (o endereço não muda). <b>Unpack</b> = mirror + injeção de &lt;base&gt; pra carregar imagens/CSS do site original. <b>URL</b> = a página branca (ex.: blog).</p>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Método de entrega</label>';
    html += '<div class="radio-pills">';
    [['redirect', 'Redirect', '302 pra URL segura'], ['mirror', 'Mirror', 'serve a safe page no seu domínio via proxy'], ['unpack', 'Unpack', 'proxy reescrevendo assets']].forEach(function (m) {
      html += '<div class="radio-pill">';
      html += '<input type="radio" name="safe-method" id="safe-' + m[0] + '" value="' + m[0] + '"' + (c.safe.method === m[0] ? ' checked' : '') + ' />';
      html += '<label for="safe-' + m[0] + '" title="' + esc(m[2]) + '">' + esc(m[1]) + '</label>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">URL da Safe Page<span class="required">*</span></label>';
    html += '<input type="text" class="form-input" id="cp-safe-url" value="' + esc(c.safe.url) + '" placeholder="https://…/compra?topic=jaqueta" />';
    html += '</div>';
    html += '</div>';

    // Card: Offer Page
    html += '<div class="cp-card">';
    html += '<div class="cp-card-header">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    html += '<h3>Offer Page</h3>';
    html += '<p class="card-help">Página que o cliente real vê ao passar nos filtros. <b>Internal</b> = serve a loja deste servidor (recomendado). <b>Redirect</b> = 302 pra URL externa. <b>Mirror</b> = proxy da offer externa no seu domínio. <b>Single</b> = 1 URL de offer. <b>A/B Storm</b> = várias URLs (uma por linha); cada visitante cai sempre na mesma variante (hash de IP+UA). <b>URL da Offer</b> = a loja/página que vende.</p>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Método</label>';
    html += '<div class="radio-pills">';
    [['internal', 'Internal', 'servir a loja deste servidor'], ['redirect', 'Redirect', 'redirecionar pra URL externa'], ['mirror', 'Mirror', 'proxy pra URL externa']].forEach(function (m) {
      html += '<div class="radio-pill">';
      html += '<input type="radio" name="offer-method" id="offer-' + m[0] + '" value="' + m[0] + '"' + (c.offer.method === m[0] ? ' checked' : '') + ' />';
      html += '<label for="offer-' + m[0] + '" title="' + esc(m[2]) + '">' + esc(m[1]) + '</label>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Tipo de oferta</label>';
    html += '<div class="radio-pills">';
    [['single', 'Single', 'uma URL fixa'], ['ab', 'A/B Storm', 'rotaciona URLs']].forEach(function (t) {
      html += '<div class="radio-pill">';
      html += '<input type="radio" name="offer-type" id="offer-type-' + t[0] + '" value="' + t[0] + '"' + (c.offer.type === t[0] ? ' checked' : '') + ' />';
      html += '<label for="offer-type-' + t[0] + '" title="' + esc(t[2]) + '">' + esc(t[1]) + '</label>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="form-group" id="cp-offer-urls-group">';
    html += '<label class="form-label" id="cp-offer-urls-label">URL da Offer Page</label>';
    html += '<textarea class="form-textarea" id="cp-offer-urls" placeholder="Uma URL por linha">' + esc((c.offer.urls || []).join('\n')) + '</textarea>';
    html += '</div>';
    html += '</div>';

    // Card: Rastreio
    html += '<div class="cp-card">';
    html += '<div class="cp-card-header">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
    html += '<h3>Rastreio</h3>';
    html += '<p class="card-help"><b>Como usar o Token Único</b>: cada campanha tem seu próprio código (ex.: 540e1939c5). Quando o Método da Offer é <b>Redirect</b>, o sistema anexa <b>tk=SEU_TOKEN</b> automaticamente no final da URL da offer — assim, olhando o destino, você sabe qual campanha gerou aquele clique/venda. No anúncio você NÃO cola o token: cola só o Caminho personalizado /c/…. O token serve pra (1) conferir no destino de qual campanha veio o tráfego e (2) rotacionar no botão "Atualizar" se o link vazar (o antigo para de marcar). Com método <b>Internal</b> o rastreio já é feito pelos logs ("Visitantes recentes"), porque o próprio /c/ identifica a campanha. <b>Caminho personalizado /c/…</b> = É ESTE LINK que você cola no anúncio — o nome depois do /c/ você escolhe no campo abaixo. Todo acesso fica registrado em “Visitantes recentes” (IP, país, dispositivo, resultado).</p>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="toggle-switch">';
    html += '<input type="checkbox" id="cp-tokenEnabled"' + (c.tokenEnabled ? ' checked' : '') + '>';
    html += '<span class="toggle-slider"></span>';
    html += '</label>';
    html += '<span style="margin-left:12px;color:#e5e5ea">Ativar Token Único</span>';
    html += '</div>';
    html += '<div class="form-group">';
    html += '<label class="form-label">Nome do caminho (/c/…)</label>';
    html += '<input type="text" class="form-input" id="cp-slug" value="' + esc(c.slug || '') + '" placeholder="ex.: ttkshop-toalha" />';
    html += '<p class="form-hint">você escolhe o nome depois do /c/ — use letras minúsculas, números e hífen. Ao mudar, o link antigo para de valer.</p>';
    html += '</div>';
    if (editingId && c.token) {
      html += '<div class="form-group">';
      html += '<label class="form-label">Token</label>';
      html += '<div class="token-display">';
      html += '<div class="token-value">' + esc(c.token) + '</div>';
      html += '<button class="btn-ghost btn-sm" id="cp-btn-regen">Atualizar</button>';
      html += '</div>';
      html += '</div>';
    }
    if (editingId && c.slug) {
      html += '<div class="form-group">';
      html += '<label class="form-label">Caminho personalizado</label>';
      html += '<div class="path-chip">';
      html += '<div class="path-chip-value">' + esc(window.location.origin + '/c/' + c.slug) + '</div>';
      html += '<button class="copy-btn" data-copy="' + esc(window.location.origin + '/c/' + c.slug) + '">' + copyIcon() + '</button>';
      html += '</div>';
      html += '<p class="form-hint">cole esta URL no anúncio</p>';
      html += '</div>';
    }
    html += '</div>';

    // Card: Filtros
    html += '<div class="cp-card">';
    html += '<div class="cp-card-header">';
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
    html += '<h3>Filtros</h3>';
    html += '<p class="card-help"><b>UA de bot</b> = bloqueia robôs/crawlers (googlebot, tiktokbot, curl…). <b>Automação</b> = bloqueia selenium/puppeteer/playwright/headless. <b>WebGL software</b> = bloqueia navegador com renderização por software (headless). <b>Parece desktop</b> = manda PC disfarçado de mobile pra safe page. <b>IP datacenter</b> = bloqueia hospedagens (Amazon, Google, DO, Vultr, Hetzner…). <b>Proxy</b> = bloqueia IP marcado como proxy. <b>Tor</b> = bloqueia saída Tor. <b>Liberar clique pago (ttclid)</b> = ON: clique real do anúncio com ttclid passa sem ser filtrado; OFF: até clique com ttclid entra nos filtros (use durante a revisão do criativo).</p>';
    html += '</div>';
    html += '<div class="toggle-grid">';
    var filters = [
      { key: 'botUa', label: 'User-agent de bot' },
      { key: 'automation', label: 'Automação/webdriver' },
      { key: 'softwareGl', label: 'WebGL de software' },
      { key: 'desktopLike', label: 'Parece desktop' },
      { key: 'datacenterIp', label: 'IP datacenter/hospedagem' },
      { key: 'proxy', label: 'Proxy' },
      { key: 'tor', label: 'Tor' },
      { key: 'ttclidBypass', label: 'Liberar clique pago (ttclid)' },
      { key: 'captcha', label: 'Captcha Anti-Bot (Desafio de Imagens)' }
    ];
    filters.forEach(function (f) {
      html += '<div class="toggle-item">';
      html += '<span class="toggle-item-label">' + esc(f.label) + '</span>';
      html += '<label class="toggle-switch">';
      html += '<input type="checkbox" class="cp-filter" data-key="' + f.key + '"' + (c.filters[f.key] ? ' checked' : '') + '>';
      html += '<span class="toggle-slider"></span>';
      html += '</label>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';

    html += '</div>'; // end right column
    html += '</div>'; // end grid
    html += '</div>'; // end editor

    container.innerHTML = html;

    // Event listeners
    document.getElementById("cp-btn-back").addEventListener("click", function () {
      loadList();
    });

    document.getElementById("cp-btn-save").addEventListener("click", function () {
      saveCampaign();
    });

    document.getElementById("cp-countryMode").addEventListener("change", function (e) {
      var group = document.getElementById("cp-countries-group");
      if (group) {
        group.style.display = e.target.value === 'off' ? 'none' : 'block';
      }
    });

    document.querySelectorAll('input[name="offer-type"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        var label = document.getElementById("cp-offer-urls-label");
        if (label) {
          label.textContent = radio.value === 'single' ? 'URL da Offer Page' : 'URLs da Offer Page (uma por linha)';
        }
      });
    });

    if (editingId) {
      var regenBtn = document.getElementById("cp-btn-regen");
      if (regenBtn) {
        regenBtn.addEventListener("click", function () {
          regenBtn.disabled = true;
          regenToken(editingId)
            .then(function (newToken) {
              var c = campaigns.find(function (x) { return x.id === editingId; });
              if (c) c.token = newToken;
              toast("Token atualizado", "success");
              renderEditor(c);
            })
            .catch(function (e) {
              regenBtn.disabled = false;
              toast(e.message || "Falha ao regenerar", "error");
            });
        });
      }
    }

    container.querySelectorAll(".copy-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(btn.getAttribute("data-copy"));
      });
    });
  }

  function saveCampaign() {
    var name = document.getElementById("cp-name").value.trim();
    var domain = document.getElementById("cp-domain").value.trim();
    var source = document.getElementById("cp-source").value;
    var entryStore = document.getElementById("cp-entryStore").value;
    var device = document.getElementById("cp-device").value;
    var countryMode = document.getElementById("cp-countryMode").value;
    var countriesInput = document.getElementById("cp-countries");
    var countries = countriesInput ? countriesInput.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    var safeMethod = document.querySelector('input[name="safe-method"]:checked').value;
    var safeUrl = document.getElementById("cp-safe-url").value.trim();
    var offerMethod = document.querySelector('input[name="offer-method"]:checked').value;
    var offerType = document.querySelector('input[name="offer-type"]:checked').value;
    var offerUrlsText = document.getElementById("cp-offer-urls").value;
    var offerUrls = offerUrlsText.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var tokenEnabled = document.getElementById("cp-tokenEnabled").checked;
    var slugVal = document.getElementById("cp-slug") ? document.getElementById("cp-slug").value.trim() : "";

    var filters = {};
    document.querySelectorAll(".cp-filter").forEach(function (cb) {
      filters[cb.getAttribute("data-key")] = cb.checked;
    });

    // Validation
    if (!name) {
      toast("Nome da campanha é obrigatório", "error");
      return;
    }
    if (!domain) {
      toast("Domínio é obrigatório", "error");
      return;
    }
    if (!safeUrl && safeMethod !== 'internal') {
      toast("URL da Safe Page é obrigatória", "error");
      return;
    }

    var data = {
      name: name,
      domain: domain,
      source: source,
      entryStore: entryStore,
      safe: { method: safeMethod, url: safeUrl },
      offer: { method: offerMethod, type: offerType, urls: offerUrls },
      targeting: { device: device, countryMode: countryMode, countries: countries },
      filters: filters,
      tokenEnabled: tokenEnabled,
      slug: slugVal
    };

    var btn = document.getElementById("cp-btn-save");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    var promise = editingId ? updateCampaign(editingId, data) : createCampaign(data);

    promise
      .then(function () {
        toast("Campanha salva", "success");
        loadList();
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = "Salvar";
        toast(e.message || "Falha ao salvar", "error");
      });
  }

  function openEditor(campaign) {
    editingId = campaign ? campaign.id : null;
    renderEditor(campaign);
  }

  function loadList() {
    editingId = null;
    Promise.all([fetchCampaigns(), fetchStats()])
      .then(function () {
        renderList();
      })
      .catch(function (e) {
        if (e.message !== "expired") {
          toast(e.message || "Falha ao carregar", "error");
        }
      });
  }

  // Initialize when page loads
  function init() {
    var page = document.getElementById("page-cloakerpro");
    if (!page) return;

    var container = document.createElement("div");
    container.id = "cloakerpro-container";
    container.className = "cloakerpro-page";
    page.appendChild(container);

    // Watch for page activation
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (page.classList.contains('active')) {
            loadList();
          }
        }
      });
    });

    observer.observe(page, { attributes: true });

    // Load immediately if already active
    if (page.classList.contains('active')) {
      loadList();
    }
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ---------- Visitantes recentes (log de acessos /c/) ---------- */
(function () {
  "use strict";
  function vkToken() {
    try { return sessionStorage.getItem("admin_token") || localStorage.getItem("admin_token") || ""; } catch (e) { return ""; }
  }
  function vkHeaders() {
    var h = { Accept: "application/json" };
    var t = vkToken();
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }
  function vkEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var st = document.createElement("style");
  st.textContent = ".vk-card{background:#131318;border:1px solid #232329;border-radius:16px;margin-top:18px;overflow:hidden}.vk-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #232329}.vk-head h3{margin:0;font-size:14px;color:#e5e5ea;font-weight:700}.vk-head span{font-size:11px;color:#8b8b94}.vk-wrap{overflow-x:auto}.vk-table{width:100%;border-collapse:collapse;font-size:12px;min-width:880px}.vk-table th{text-align:left;color:#8b8b94;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;padding:10px 12px;border-bottom:1px solid #232329}.vk-table td{padding:9px 12px;border-bottom:1px solid #1b1b22;color:#d6d6dc;vertical-align:top}.vk-table tr:hover td{background:#17171d}.vk-mono{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#ff6aa8}.vk-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700}.vk-offer{background:rgba(255,106,168,.15);color:#ff6aa8}.vk-safe{background:rgba(52,211,153,.15);color:#34d399}.vk-bot{background:rgba(251,191,36,.15);color:#fbbf24}.vk-dim{color:#8b8b94}";
  document.head.appendChild(st);
  var box = null;
  function pageActive() {
    var el = document.getElementById("page-cloakerpro");
    return !!(el && el.classList.contains("active"));
  }
  function ensureBox() {
    var page = document.getElementById("page-cloakerpro");
    if (!page) return null;
    if (!box || !document.body.contains(box)) {
      box = document.createElement("div");
      box.className = "vk-card";
      box.innerHTML =
        '<div class="vk-head"><h3>Visitantes recentes</h3><span>IP · país · dispositivo · origem · resultado</span></div>' +
        '<div class="vk-wrap"><table class="vk-table"><thead><tr>' +
        "<th>Hora</th><th>Campanha</th><th>IP</th><th>País</th><th>Dispositivo</th><th>ttclid</th><th>Referer</th><th>Resultado</th><th>Motivo</th>" +
        "</tr></thead><tbody id=\"vk-body\"><tr><td colspan=\"9\" class=\"vk-dim\">Carregando…</td></tr></tbody></table></div>";
      page.appendChild(box);
    }
    return box;
  }
  function fmtTime(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " " + d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    } catch (e) { return ""; }
  }
  var REASON_PT = {
    "device-none": "Dispositivo Nenhum (Safe Page)",
    "device-mobile-only": "Apenas Mobile (Safe Page)",
    "device-desktop-only": "Apenas Desktop (Safe Page)",
    "captcha": "Captcha Exibido", "bot-ua": "UA de bot", automation: "Automação", "desktop-like": "Parece desktop", device: "Dispositivo", proxy: "Proxy", tor: "Tor", datacenter: "Datacenter", country: "País" };
  function load() {
    if (!pageActive() || !ensureBox()) return;
    fetch("/api/admin/campaigns/log?limit=100", { headers: vkHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var body = document.getElementById("vk-body");
        if (!body) return;
        var log = (j && j.log) || [];
        if (!log.length) {
          body.innerHTML = '<tr><td colspan="9" class="vk-dim">Nenhum acesso registrado ainda — rode o link /c/ e volte aqui.</td></tr>';
          return;
        }
        body.innerHTML = log.map(function (e) {
          var badge = e.outcome === "offer" ? '<span class="vk-badge vk-offer">Offer</span>' : e.outcome === "bot" ? '<span class="vk-badge vk-bot">Bot</span>' : e.outcome === "captcha" ? '<span class="vk-badge" style="background:#0284c7;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;">Captcha</span>' : '<span class="vk-badge vk-safe">Safe</span>';
          return (
            '<tr><td class="vk-dim">' + vkEsc(fmtTime(e.t)) + "</td>" +
            "<td>" + vkEsc(e.slug || "") + "</td>" +
            '<td class="vk-mono">' + vkEsc(e.ip || "") + "</td>" +
            "<td>" + vkEsc(e.cc || "—") + "</td>" +
            "<td>" + vkEsc(e.device || "") + "</td>" +
            "<td>" + (e.ttclid ? '<span class="vk-badge vk-safe">sim</span>' : '<span class="vk-dim">não</span>') + "</td>" +
            '<td class="vk-dim">' + vkEsc(e.ref || "direto") + "</td>" +
            "<td>" + badge + "</td>" +
            '<td class="vk-dim">' + vkEsc(REASON_PT[e.reason] || e.reason || "—") + "</td></tr>"
          );
        }).join("");
      })
      .catch(function () {});
  }
  setInterval(function () { if (pageActive()) load(); }, 15000);
  var mo = new MutationObserver(function () { if (pageActive()) { ensureBox(); load(); } });
  function watch() {
    var page = document.getElementById("page-cloakerpro");
    if (page) mo.observe(page, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();
