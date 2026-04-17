/* ================================================================
   REX COMMAND ZONE — Custom Layout Engine
   Reads data from Kuma's live DOM, renders a completely new UI
   ================================================================ */
(function () {
  'use strict';

  var REFRESH_MS = 2000;
  var selectedIdx = -1;

  function qs(s, c) { return (c || document).querySelector(s); }
  function qsa(s, c) { return Array.from((c || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Extract monitor groups from Kuma's hidden DOM ── */
  function extractGroups() {
    var rows = qsa('.monitor-list .item');
    if (!rows.length) rows = qsa('[data-v-185096f3] .item, .sidebar .item');
    if (!rows.length) {
      // fallback: any element that has beats inside it
      rows = qsa('.item').filter(function(r){ return qs('.beat',r); });
    }

    return rows.map(function(row) {
      // name: the text content minus the badge text
      var badge = qs('.badge', row);
      var uptime = badge ? badge.textContent.trim() : '';
      var status = 'up';
      if (badge) {
        if (badge.classList.contains('bg-danger'))   status = 'down';
        else if (badge.classList.contains('bg-warning')) status = 'warn';
        else if (badge.classList.contains('bg-secondary')) status = 'pause';
      }

      // strip badge text from full row text to get name
      var rawText = row.textContent.replace(uptime,'').trim();
      // also strip common prefixes
      var name = rawText.replace(/^[\s›>◇◈]+/,'').replace(/\n.*/,'').trim();

      // beats
      var beats = qsa('.beat', row).map(function(b){
        if (b.classList.contains('down'))        return 'd';
        if (b.classList.contains('empty'))       return 'e';
        if (b.classList.contains('pending'))     return 'p';
        if (b.classList.contains('maintenance')) return 'm';
        return 'u';
      });

      return { name: name, uptime: uptime, status: status, beats: beats };
    }).filter(function(g){ return g.name.length > 1; });
  }

  /* ── Clock ── */
  function tickClock() {
    var el = document.getElementById('rz-clock');
    if (!el) return;
    var d = new Date();
    var pad = function(n){ return n < 10 ? '0'+n : n; };
    el.textContent = pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+' UTC';
  }

  /* ── Build the overlay DOM (once) ── */
  function buildOverlay() {
    var el = document.createElement('div');
    el.id = 'rz-overlay';
    el.innerHTML =
      '<div id="rz-topbar">'+
        '<div class="rz-brand"><span class="rz-diamond">◈</span> REX COMMAND ZONE</div>'+
        '<div id="rz-statstrip"></div>'+
        '<div class="rz-topbar-right">'+
          '<span class="rz-tag-env">ENV: PROD</span>'+
          '<span class="rz-tag-live"><em class="rz-blink"></em>LIVE</span>'+
          '<span class="rz-tag-clock" id="rz-clock"></span>'+
        '</div>'+
      '</div>'+
      '<div id="rz-body">'+
        '<div id="rz-center">'+
          '<div class="rz-section-hdr">'+
            '<span>INFRASTRUCTURE MONITORS</span>'+
            '<span id="rz-count" class="rz-count"></span>'+
          '</div>'+
          '<div id="rz-grid"></div>'+
        '</div>'+
        '<div id="rz-panel">'+
          '<div class="rz-panel-hdr">MONITOR DETAIL</div>'+
          '<div id="rz-panel-body">'+
            '<div class="rz-panel-empty">'+
              '<div class="rz-empty-icon">◈</div>'+
              '<div>Select a monitor group<br>to view details</div>'+
            '</div>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div id="rz-footer">REX COMMAND ZONE &nbsp;·&nbsp; TASK ENTERPRISE LLC &nbsp;·&nbsp; PRODUCTION</div>';

    document.body.appendChild(el);
    tickClock();
    setInterval(tickClock, 1000);
  }

  /* ── Stat strip ── */
  function renderStats(groups) {
    var strip = document.getElementById('rz-statstrip');
    if (!strip) return;
    var total = groups.length;
    var down  = groups.filter(function(g){ return g.status==='down'; }).length;
    var warn  = groups.filter(function(g){ return g.status==='warn'; }).length;
    var up    = total - down - warn;
    strip.innerHTML =
      mkStat(total, 'TOTAL', '') +
      mkStat(up,   'UP',    'up') +
      mkStat(warn, 'WARN',  warn?'warn':'') +
      mkStat(down, 'DOWN',  down?'dn':'');
  }

  function mkStat(val, lbl, cls) {
    return '<div class="rz-stat'+(cls?' rz-stat-'+cls:'')+'">'+
      '<b>'+val+'</b><span>'+lbl+'</span></div>';
  }

  /* ── Card grid ── */
  function renderGrid(groups) {
    var grid = document.getElementById('rz-grid');
    var countEl = document.getElementById('rz-count');
    if (!grid) return;

    if (!groups.length) {
      document.body.classList.remove('rz-overlay-active');
      grid.innerHTML = '<div class="rz-loading">⟳ &nbsp; Connecting to Uptime Kuma...</div>';
      return;
    }
    document.body.classList.add('rz-overlay-active');
    if (countEl) countEl.textContent = groups.length + ' groups';

    var html = groups.map(function(g, i) {
      var disp  = g.name.replace(/^GROUP\s*[-–]\s*/i,'').replace(/^GROUP\s+/i,'');
      var sc    = g.status==='down'?'rz-card-dn':g.status==='warn'?'rz-card-warn':g.status==='pause'?'rz-card-pause':'rz-card-up';
      var active= i===selectedIdx?' rz-card-sel':'';
      var beats = g.beats.slice(-40);
      var statusLabel = g.status==='down'?'DOWN':g.status==='warn'?'DEGRADED':g.status==='pause'?'PAUSED':'OPERATIONAL';

      var beatHtml = beats.map(function(b){
        var bc = b==='d'?'rb-dn':b==='e'?'rb-e':b==='p'?'rb-p':b==='m'?'rb-m':'rb-u';
        return '<i class="rb '+bc+'"></i>';
      }).join('');

      // mini uptime bar width
      var upCount = beats.filter(function(b){ return b==='u'; }).length;
      var uptimePct = beats.length ? Math.round(upCount/beats.length*100) : 0;

      return '<div class="rz-card '+sc+active+'" data-idx="'+i+'">'+
        '<div class="rz-card-top">'+
          '<span class="rz-card-name">'+esc(disp)+'</span>'+
          '<span class="rz-card-uptime '+sc+'">'+esc(g.uptime)+'</span>'+
        '</div>'+
        '<div class="rz-card-beats">'+beatHtml+'</div>'+
        '<div class="rz-card-bar-track"><div class="rz-card-bar '+sc+'" style="width:'+uptimePct+'%"></div></div>'+
        '<div class="rz-card-foot">'+
          '<span class="rz-card-sl rz-sl-'+g.status+'">'+statusLabel+'</span>'+
          '<span class="rz-card-bc">'+beats.length+' beats</span>'+
        '</div>'+
      '</div>';
    }).join('');

    grid.innerHTML = html;

    qsa('.rz-card', grid).forEach(function(card){
      card.addEventListener('click', function(){
        var idx = parseInt(this.dataset.idx, 10);
        selectedIdx = idx;
        qsa('.rz-card').forEach(function(c){ c.classList.remove('rz-card-sel'); });
        this.classList.add('rz-card-sel');
        renderPanel(groups[idx]);
      });
    });
  }

  /* ── Right panel ── */
  function renderPanel(g) {
    var body = document.getElementById('rz-panel-body');
    if (!body) return;

    var disp  = g.name.replace(/^GROUP\s*[-–]\s*/i,'').replace(/^GROUP\s+/i,'');
    var beats = g.beats;
    var up    = beats.filter(function(b){ return b==='u'; }).length;
    var dn    = beats.filter(function(b){ return b==='d'; }).length;
    var total = beats.length;
    var pct   = total ? (upCount = up, Math.round(up/total*1000)/10) : 0;
    var statusLabel = g.status==='down'?'DOWN':g.status==='warn'?'DEGRADED':g.status==='pause'?'PAUSED':'OPERATIONAL';
    var arcColor = g.status==='down'?'#ff3a3a':g.status==='warn'?'#ffcc00':'#00ff88';

    // SVG ring
    var r=38, cx=50, cy=50, sw=9, circ=2*Math.PI*r;
    var arc = circ*(pct/100);
    var svg =
      '<svg width="100" height="100" viewBox="0 0 100 100">'+
        '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="'+sw+'"/>'+
        '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+arcColor+'" stroke-width="'+sw+'"'+
          ' stroke-dasharray="'+arc+' '+circ+'" stroke-linecap="round"'+
          ' transform="rotate(-90 '+cx+' '+cy+')"'+
          ' style="filter:drop-shadow(0 0 8px '+arcColor+')"/>'+
        '<text x="'+cx+'" y="'+(cy+6)+'" text-anchor="middle" fill="'+arcColor+'"'+
          ' font-size="15" font-weight="900" font-family="Inter,sans-serif">'+pct+'%</text>'+
      '</svg>';

    var beatHtml = beats.map(function(b){
      var bc=b==='d'?'rb-dn':b==='e'?'rb-e':b==='p'?'rb-p':'rb-u';
      return '<i class="rb '+bc+'"></i>';
    }).join('');

    body.innerHTML =
      '<div class="rz-pnl-name">'+esc(disp)+'</div>'+
      '<div class="rz-pnl-status rz-sl-'+g.status+'">'+statusLabel+'</div>'+
      '<div class="rz-pnl-ring">'+svg+'</div>'+
      '<div class="rz-pnl-sec">HEARTBEAT HISTORY</div>'+
      '<div class="rz-pnl-beats">'+beatHtml+'</div>'+
      '<div class="rz-pnl-sec">STATISTICS</div>'+
      '<div class="rz-pnl-kv"><span>Uptime</span><span>'+esc(g.uptime)+'</span></div>'+
      '<div class="rz-pnl-kv"><span>Beats total</span><span>'+total+'</span></div>'+
      '<div class="rz-pnl-kv"><span>Beats up</span><span class="rz-green">'+up+'</span></div>'+
      '<div class="rz-pnl-kv"><span>Beats down</span><span class="'+(dn>0?'rz-red':'')+'">'+dn+'</span></div>'+
      '<div class="rz-pnl-kv"><span>Calculated</span><span>'+pct+'%</span></div>'+
      '<div class="rz-pnl-sec">ACTIONS</div>'+
      '<div class="rz-pnl-actions">'+
        '<a class="rz-act" href="/dashboard" target="_blank">OPEN IN KUMA</a>'+
        '<a class="rz-act rz-act-sec" href="/settings" target="_blank">SETTINGS</a>'+
      '</div>';
  }

  /* ── Sync loop ── */
  function sync() {
    var groups = extractGroups();
    renderStats(groups);
    renderGrid(groups);
    if (selectedIdx >= 0 && groups[selectedIdx]) renderPanel(groups[selectedIdx]);
  }

  /* ── Boot ── */
  function init() {
    if (document.getElementById('rz-overlay')) return;
    buildOverlay();
    sync();
    setInterval(sync, REFRESH_MS);
  }

  document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 50); });
  window.addEventListener('load',               function(){ setTimeout(init, 50); });
})();
