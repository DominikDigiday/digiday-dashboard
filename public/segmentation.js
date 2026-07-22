/* Segmentation module — zdieľaný medzi všetkými report stránkami digiday-dashboard.
 * Načítá tímy + operátory zo Supabase cez /api/teams a /api/operators, renderuje
 * filter UI (chip bar per tím + multi-select operátorov) a vystavuje vyfiltrovaný
 * zoznam operátorov v cfg-compatible tvare (.name, .pos, .planM, .planD, .active).
 *
 * Použitie:
 *   <div id="seg-bar"></div>
 *   Segmentation.attach('seg-bar', { onChange: render });
 *
 * Persistencia výberu v localStorage pod kľúčom 'digiday-seg-v1'.
 */
(function() {
  var STORAGE_KEY = 'digiday-seg-v1';
  var state = {
    teams: [],
    operators: [],          // raw z API (pd_user_id, pd_user_name, team_id, position, plan_monthly, plan_daily, active)
    selectedTeamIds: null,  // null = všetky tímy, [] = žiadny, ['team-1','team-2'] = filtrovať
    selectedPdIds: null,    // null = všetky operátori, [...] = filtrovať
    onlyActive: true,
    loaded: false,
    onChange: null,
    container: null,
  };

  function loadSelection() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { return; }
      var s = JSON.parse(raw);
      if (s.selectedTeamIds !== undefined) state.selectedTeamIds = s.selectedTeamIds;
      if (s.selectedPdIds !== undefined) state.selectedPdIds = s.selectedPdIds;
      if (typeof s.onlyActive === 'boolean') state.onlyActive = s.onlyActive;
    } catch (e) {}
  }

  function saveSelection() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedTeamIds: state.selectedTeamIds,
        selectedPdIds: state.selectedPdIds,
        onlyActive: state.onlyActive,
      }));
    } catch (e) {}
  }

  function mapToCfg(op) {
    return {
      name: op.pd_user_name,
      pos: op.position || 'junior1',
      planM: op.plan_monthly || 0,
      planD: op.plan_daily || 0,
      active: op.active !== false,
      pd_user_id: op.pd_user_id,
      team_id: op.team_id,
    };
  }

  function isOpVisible(op) {
    if (state.onlyActive && op.active === false) return false;
    if (state.selectedTeamIds !== null) {
      if (!state.selectedTeamIds.includes(op.team_id || '__none__')) return false;
    }
    if (state.selectedPdIds !== null) {
      if (!state.selectedPdIds.includes(Number(op.pd_user_id))) return false;
    }
    return true;
  }

  function getFilteredOperators() {
    return state.operators.filter(isOpVisible).map(mapToCfg);
  }

  function applyToCfg() {
    // Stránky deklarujú cfg cez `let`, takže nie je na window — musíme siahnuť
    // na globálny lexikálny binding priamo (typeof je bezpečný aj keď neexistuje).
    try {
      if (typeof cfg === 'object' && cfg) {
        cfg.operators = getFilteredOperators();
      }
    } catch (e) { console.warn('Segmentation.applyToCfg:', e); }
  }

  function fire() {
    applyToCfg();
    saveSelection();
    if (typeof state.onChange === 'function') {
      try { state.onChange(); } catch (e) { console.error('Segmentation onChange:', e); }
    }
  }

  function teamLabel(t) {
    return (t.name || t.id || '').replace(/</g, '&lt;');
  }

  function countOpsForTeam(teamId) {
    return state.operators.filter(function(o) {
      var tid = o.team_id || '__none__';
      return tid === teamId && (!state.onlyActive || o.active !== false);
    }).length;
  }

  function teamsForChips() {
    var arr = state.teams.slice().sort(function(a, b) { return (a.position||0) - (b.position||0); });
    var hasUnassigned = state.operators.some(function(o) { return !o.team_id; });
    if (hasUnassigned) {
      arr.push({ id: '__none__', name: 'Bez týmu', color: '#888' });
    }
    return arr;
  }

  function render() {
    if (!state.container) return;
    var teams = teamsForChips();
    var totalOps = state.operators.filter(function(o) { return !state.onlyActive || o.active !== false; }).length;

    var allTeamsActive = state.selectedTeamIds === null;
    var html = '<div class="seg-row">';

    // "Všechny týmy" chip
    html += '<button class="seg-chip seg-chip-all' + (allTeamsActive ? ' act' : '') + '" data-team="__all__">'
      + '<span class="seg-chip-dot" style="background:#FF009E"></span>'
      + '<span>Všechny týmy</span>'
      + '<span class="seg-chip-count">' + totalOps + '</span>'
      + '</button>';

    teams.forEach(function(t) {
      var sel = state.selectedTeamIds !== null && state.selectedTeamIds.includes(t.id);
      var cnt = countOpsForTeam(t.id);
      html += '<button class="seg-chip' + (sel ? ' act' : '') + '" data-team="' + t.id + '" style="--chip-clr:' + (t.color || '#FF009E') + '">'
        + '<span class="seg-chip-dot" style="background:' + (t.color || '#FF009E') + '"></span>'
        + '<span>' + teamLabel(t) + '</span>'
        + '<span class="seg-chip-count">' + cnt + '</span>'
        + '</button>';
    });

    // Operator picker button
    var pickedCount = state.selectedPdIds === null ? null : state.selectedPdIds.length;
    var pickerLbl = pickedCount === null ? 'Operátoři: vše' : 'Operátoři: ' + pickedCount;
    html += '<button class="seg-chip seg-picker-btn' + (pickedCount !== null ? ' act' : '') + '" id="seg-picker-open">'
      + '<span class="seg-chip-dot" style="background:#40C4FF"></span>'
      + '<span>' + pickerLbl + '</span>'
      + (pickedCount !== null ? '<span class="seg-chip-clear" title="Zrušit filtr">×</span>' : '')
      + '</button>';

    html += '</div>';

    // Picker dropdown (hidden by default)
    html += '<div class="seg-picker" id="seg-picker" style="display:none">';
    html += '<div class="seg-picker-head">';
    html += '<input type="text" class="seg-picker-search" id="seg-picker-search" placeholder="Hledat…">';
    html += '<button class="seg-picker-btn" id="seg-picker-all">Vše</button>';
    html += '<button class="seg-picker-btn" id="seg-picker-none">Nic</button>';
    html += '<button class="seg-picker-btn seg-picker-close" id="seg-picker-close">Hotovo</button>';
    html += '</div>';
    html += '<div class="seg-picker-list" id="seg-picker-list"></div>';
    html += '</div>';

    state.container.innerHTML = html;

    // Wire team chips
    state.container.querySelectorAll('.seg-chip[data-team]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-team');
        if (id === '__all__') {
          state.selectedTeamIds = null;
        } else {
          if (state.selectedTeamIds === null) {
            // first specific selection → start fresh array with just this one
            state.selectedTeamIds = [id];
          } else {
            var idx = state.selectedTeamIds.indexOf(id);
            if (idx >= 0) {
              state.selectedTeamIds.splice(idx, 1);
              if (state.selectedTeamIds.length === 0) {
                state.selectedTeamIds = null;  // späť na "všetky"
              }
            } else {
              state.selectedTeamIds.push(id);
            }
          }
        }
        render(); fire();
      });
    });

    // Picker button
    var pickBtn = document.getElementById('seg-picker-open');
    var pickerEl = document.getElementById('seg-picker');
    if (pickBtn && pickerEl) {
      pickBtn.addEventListener('click', function(e) {
        // ak klikol na ×, len reset
        if (e.target && e.target.classList && e.target.classList.contains('seg-chip-clear')) {
          state.selectedPdIds = null;
          render(); fire();
          e.stopPropagation();
          return;
        }
        var open = pickerEl.style.display !== 'none';
        if (open) {
          pickerEl.style.display = 'none';
        } else {
          renderPickerList('');
          pickerEl.style.display = 'block';
          var s = document.getElementById('seg-picker-search');
          if (s) { s.value = ''; s.focus(); }
        }
      });
    }

    var srch = document.getElementById('seg-picker-search');
    if (srch) {
      srch.addEventListener('input', function() { renderPickerList(srch.value); });
    }
    var btnAll = document.getElementById('seg-picker-all');
    var btnNone = document.getElementById('seg-picker-none');
    var btnClose = document.getElementById('seg-picker-close');
    if (btnAll) { btnAll.addEventListener('click', function() { state.selectedPdIds = null; render(); fire(); }); }
    if (btnNone) { btnNone.addEventListener('click', function() { state.selectedPdIds = []; render(); fire(); }); }
    if (btnClose) { btnClose.addEventListener('click', function() { pickerEl.style.display = 'none'; render(); }); }
  }

  function renderPickerList(filter) {
    var list = document.getElementById('seg-picker-list');
    if (!list) return;
    var f = (filter || '').toLowerCase().trim();
    // visible operators considering team filter, NOT pdIds (we're picking pdIds here)
    var pool = state.operators.filter(function(o) {
      if (state.onlyActive && o.active === false) return false;
      if (state.selectedTeamIds !== null && !state.selectedTeamIds.includes(o.team_id || '__none__')) return false;
      if (f && o.pd_user_name.toLowerCase().indexOf(f) < 0) return false;
      return true;
    });
    pool.sort(function(a, b) { return a.pd_user_name.localeCompare(b.pd_user_name, 'cs'); });
    if (!pool.length) {
      list.innerHTML = '<div class="seg-picker-empty">Žádní operátoři</div>';
      return;
    }
    var selected = state.selectedPdIds;
    var isSel = function(id) {
      return selected === null ? true : selected.includes(Number(id));
    };
    list.innerHTML = pool.map(function(o) {
      return '<label class="seg-picker-item' + (isSel(o.pd_user_id) ? ' sel' : '') + '">'
        + '<input type="checkbox" data-pd="' + o.pd_user_id + '"' + (isSel(o.pd_user_id) ? ' checked' : '') + '>'
        + '<span>' + o.pd_user_name + '</span>'
        + '</label>';
    }).join('');
    list.querySelectorAll('input[data-pd]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = Number(cb.getAttribute('data-pd'));
        if (state.selectedPdIds === null) {
          state.selectedPdIds = state.operators.map(function(o) { return Number(o.pd_user_id); });
        }
        var idx = state.selectedPdIds.indexOf(id);
        if (cb.checked && idx < 0) state.selectedPdIds.push(id);
        if (!cb.checked && idx >= 0) state.selectedPdIds.splice(idx, 1);
        cb.parentElement.classList.toggle('sel', cb.checked);
        fire();
        // update chip count visually
        var pickBtn = document.getElementById('seg-picker-open');
        if (pickBtn) {
          var lbl = pickBtn.querySelector('span:nth-child(2)');
          if (lbl) lbl.textContent = 'Operátoři: ' + state.selectedPdIds.length;
        }
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('seg-styles')) return;
    var css = ''
      + '#seg-bar { width:100%; margin-bottom:14px; }'
      + '.seg-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }'
      + '.seg-chip { display:inline-flex; align-items:center; gap:8px; padding:7px 14px; border-radius:999px; background:var(--sur2,#1A1A1A); border:1px solid var(--bdr2,#333); color:var(--txt2,#aaa); font-family:inherit; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; }'
      + '.seg-chip:hover { background:var(--sur3,#222); color:var(--txt,#fff); }'
      + '.seg-chip.act { background:var(--chip-clr,#FF009E); border-color:var(--chip-clr,#FF009E); color:#fff; }'
      + '.seg-chip-all.act { background:#FF009E; border-color:#FF009E; }'
      + '.seg-chip-dot { width:8px; height:8px; border-radius:50%; flex:0 0 8px; }'
      + '.seg-chip-count { font-family:var(--mono,monospace); font-size:10px; padding:2px 6px; border-radius:6px; background:rgba(255,255,255,.12); margin-left:2px; }'
      + '.seg-chip.act .seg-chip-count { background:rgba(0,0,0,.25); }'
      + '.seg-picker-btn.seg-chip { padding-right:10px; }'
      + '.seg-chip-clear { display:inline-flex; width:18px; height:18px; align-items:center; justify-content:center; border-radius:50%; background:rgba(255,255,255,.2); margin-left:4px; font-weight:700; }'
      + '.seg-chip-clear:hover { background:rgba(255,255,255,.35); }'
      + '.seg-picker { position:absolute; z-index:500; margin-top:6px; background:var(--sur1,#111); border:1px solid var(--bdr,#2a2a2a); border-radius:10px; padding:12px; width:340px; max-width:90vw; box-shadow:0 12px 40px rgba(0,0,0,.6); }'
      + '.seg-picker-head { display:flex; gap:6px; align-items:center; margin-bottom:10px; }'
      + '.seg-picker-search { flex:1; padding:7px 10px; background:var(--sur2,#1A1A1A); border:1px solid var(--bdr2,#333); color:var(--txt,#fff); border-radius:6px; font-family:inherit; font-size:12px; }'
      + '.seg-picker-btn { padding:6px 10px; background:var(--sur2,#1A1A1A); border:1px solid var(--bdr2,#333); color:var(--txt2,#aaa); border-radius:6px; font-family:inherit; font-size:11px; font-weight:600; cursor:pointer; }'
      + '.seg-picker-btn:hover { background:var(--sur3,#222); color:var(--txt,#fff); }'
      + '.seg-picker-close { background:#FF009E !important; border-color:#FF009E !important; color:#fff !important; }'
      + '.seg-picker-list { max-height:260px; overflow:auto; }'
      + '.seg-picker-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:13px; color:var(--txt2,#aaa); }'
      + '.seg-picker-item:hover { background:var(--sur2,#1A1A1A); color:var(--txt,#fff); }'
      + '.seg-picker-item.sel { color:var(--txt,#fff); }'
      + '.seg-picker-item input { accent-color:#FF009E; cursor:pointer; }'
      + '.seg-picker-empty { padding:12px; color:var(--txt3,#555); font-size:12px; text-align:center; }'
      + '.seg-loading { color:var(--txt3,#555); font-size:12px; font-family:var(--mono,monospace); }';
    var s = document.createElement('style');
    s.id = 'seg-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function attach(containerId, opts) {
    opts = opts || {};
    state.onChange = opts.onChange || null;
    state.container = document.getElementById(containerId);
    if (!state.container) { console.warn('Segmentation: missing #' + containerId); return; }
    injectStyles();
    loadSelection();
    state.container.innerHTML = '<div class="seg-loading">Načítám segmentaci…</div>';
    Promise.all([
      fetch('/api/teams').then(function(r) { return r.json(); }),
      fetch('/api/operators').then(function(r) { return r.json(); }),
    ]).then(function(arr) {
      state.teams = arr[0].teams || [];
      state.operators = (arr[1].operators || []).map(function(o) {
        return {
          pd_user_id: Number(o.pd_user_id),
          pd_user_name: o.pd_user_name,
          team_id: o.team_id,
          position: o.position,
          plan_monthly: o.plan_monthly,
          plan_daily: o.plan_daily,
          active: o.active,
        };
      });
      state.loaded = true;
      render();
      applyToCfg();
      // fire onChange so the page re-renders with API-driven cfg.operators
      if (typeof state.onChange === 'function') {
        try { state.onChange(); } catch (e) { console.error(e); }
      }
    }).catch(function(e) {
      console.error('Segmentation load error:', e);
      state.container.innerHTML = '<div class="seg-loading" style="color:var(--red,#f55)">Chyba načítání segmentace: ' + e.message + '</div>';
    });
  }

  window.Segmentation = {
    attach: attach,
    getFilteredOperators: getFilteredOperators,
    isLoaded: function() { return state.loaded; },
  };
})();
