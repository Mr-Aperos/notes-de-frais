/* Mes notes de frais — version web installable.
   Données sur le téléphone (IndexedDB), analyse des tickets par Claude, archive ZIP mensuelle. */
(() => {
  'use strict';

  const MODEL = 'claude-opus-5';
  const SETTINGS_KEY = 'ndf.settings.v1';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = !isIOS && /Android/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  // Libellés qui dépendent de l'appareil (noms des apps système, chemin de rangement conseillé).
  const P = isAndroid ? {
    storagePath: 'Google Drive › « Notes de frais »',
    shareSave: 'Partager / Enregistrer',
    photoTargets: '« Enregistrer » dans Google Photos, ou dans Fichiers / Google Drive',
    installHow: 'Dans Chrome : menu ⋮ en haut à droite, puis « Installer l’application ».',
    hint: 'Conseil : Google Drive › Notes de frais › '
  } : {
    storagePath: 'Fichiers › iCloud Drive › « Notes de frais »',
    shareSave: 'Partager / Enregistrer dans Fichiers',
    photoTargets: '« Enregistrer l’image » (Photos), « Enregistrer dans Fichiers » (dossier au choix) ou votre raccourci « Tickets »',
    installHow: 'Dans Safari : bouton Partager, puis « Sur l’écran d’accueil ».',
    hint: 'Conseil : iCloud Drive › Notes de frais › '
  };

  // Android / Chrome : le navigateur signale quand l'app est installable ; on garde l'événement pour un bouton « Installer ».
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    if (state.view === 'list') renderScreen();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    settings.installHintDismissed = true; saveSettings();
    if (state.view === 'list') renderScreen();
  });

  // ---------- catégories & icônes ----------
  const CATS = {
    meals: { label: 'Repas', icon: 'meals', hint: 'restaurant, café, repas, boissons' },
    transport: { label: 'Transport', icon: 'transport', hint: 'train, bus, taxi, parking, péage, vol' },
    lodging: { label: 'Hébergement', icon: 'lodging', hint: 'hôtel, logement' },
    fuel: { label: 'Carburant', icon: 'fuel', hint: 'essence, diesel, recharge électrique' },
    supplies: { label: 'Fournitures', icon: 'supplies', hint: 'papeterie, petites fournitures de bureau' },
    equipment: { label: 'Matériel', icon: 'equipment', hint: 'matériel informatique, mobilier, outils' },
    software: { label: 'Logiciels & abonnements', icon: 'equipment', hint: 'logiciels, abonnements SaaS, applications' },
    telecom: { label: 'Télécom', icon: 'telecom', hint: 'téléphone, internet, forfaits' },
    training: { label: 'Formation', icon: 'other', hint: 'formation, livres, conférences' },
    representation: { label: 'Représentation', icon: 'other', hint: 'cadeaux clients, invitations, réseautage' },
    fees: { label: 'Frais administratifs', icon: 'other', hint: 'frais bancaires, postaux, administratifs, assurances' },
    other: { label: 'Autre', icon: 'other', hint: 'tout ce qui ne rentre pas ailleurs' }
  };
  const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'];

  const ICONS = {
    meals: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M17 3c-2 0-3 2-3 5v3h3v10"/>',
    transport: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1-3M15 21l-1-3"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
    telecom: '<circle cx="12" cy="12" r="2"/><path d="M8 8a6 6 0 0 0 0 8M16 8a6 6 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    supplies: '<path d="M16 6l-7.5 7.5a2 2 0 1 0 3 3L19 9a4 4 0 0 0-6-6L5 11a6 6 0 0 0 8.5 8.5L20 13"/>',
    lodging: '<path d="M3 18V8M3 12h18v6M3 16h18M7 12V9h5v3"/>',
    equipment: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
    fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M5 21h10M7 7h6v4H7zM15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    other: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    warn: '<path d="M12 3L2 20h20z"/><path d="M12 9v5M12 17h.01"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 3l.7 2 2 .7-2 .7L5 8.4l-.7-2-2-.7 2-.7zM19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    err: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M9 9l6 6M15 9l-6 6"/>',
    redo: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    receipt: '<path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    download: '<path d="M12 3v12M8 11l4 4 4-4M5 21h14"/>',
    check: '<path d="M5 12l4 4L19 6"/>',
    doc: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-6 6-2-2-5 5"/>'
  };
  function icon(name, size) {
    const s = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  // ---------- réglages (localStorage) ----------
  function loadSettings() {
    // photoSave : 'ask' = proposer de ranger la photo dans Photos / Fichiers après chaque ticket, 'app' = garder dans l'app seulement.
    const base = { apiKey: '', relayUrl: '', currency: 'CHF', installHintDismissed: false, photoSave: 'ask', ownerName: '' };
    try { return Object.assign(base, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { return base; }
  }
  const settings = loadSettings();
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* stockage indisponible */ } }
  function hasAI() { return !!(settings.relayUrl.trim() || settings.apiKey.trim()); }
  function aiSourceLabel() {
    if (settings.relayUrl.trim()) return 'Relais configuré';
    if (settings.apiKey.trim()) return 'Clé enregistrée sur ce téléphone';
    return 'Aucune clé — saisie manuelle';
  }

  // ---------- base locale (IndexedDB) ----------
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('notes-de-frais', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('expenses')) d.createObjectStore('expenses', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function tx(storeName, mode, fn) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      let t;
      try {
        t = d.transaction(storeName, mode);
      } catch (e) {
        reject(e || new Error('Stockage local indisponible'));
        return;
      }
      const fail = () => reject(t.error || new Error('Écriture refusée par le stockage local'));
      let req;
      try {
        req = fn(t.objectStore(storeName));
      } catch (e) {
        reject(e || new Error('Écriture refusée par le stockage local'));
        return;
      }
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = fail;
      t.onabort = fail;
    });
  }
  // Les images sont stockées en ArrayBuffer (+ type MIME) : un Blob direct est refusé par certains moteurs WebKit.
  const store = {
    all: () => tx('expenses', 'readonly', s => s.getAll()),
    put: e => tx('expenses', 'readwrite', s => s.put(e)),
    remove: id => tx('expenses', 'readwrite', s => s.delete(id)),
    image: async id => {
      const r = await tx('images', 'readonly', s => s.get(id));
      if (!r) return null;
      if (r.buffer) return new Blob([r.buffer], { type: r.type || 'image/jpeg' });
      return r.blob || null;
    },
    putImage: async (id, blob) => {
      const buffer = await blob.arrayBuffer();
      return tx('images', 'readwrite', s => s.put({ id, type: blob.type || 'image/jpeg', buffer }));
    },
    removeImage: id => tx('images', 'readwrite', s => s.delete(id))
  };
  function errText(e, fallback) { return (e && e.message) ? e.message : fallback; }

  // ---------- état ----------
  const state = {
    expenses: [],
    view: 'list',
    editing: null,
    sheet: null,
    draft: null,
    analysis: 'idle',
    analysisError: '',
    abort: null,
    archive: null,
    photoShare: null,
    exportMonth: null,
    busy: false
  };

  // ---------- formatage fr_CH ----------
  function money(v, cur) {
    try { return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: cur }).format(v); }
    catch (e) { return v.toFixed(2) + ' ' + cur; }
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shortDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function monthTitle(key) {
    const d = new Date(key + '-01T12:00:00');
    const s = d.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function csvDate(iso) { const p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function parseNum(s) { const x = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return isNaN(x) ? null : x; }
  function num2(v) { return v == null ? '' : v.toFixed(2); }

  function groups() {
    const map = {};
    state.expenses.forEach(e => { const k = e.date.slice(0, 7); (map[k] = map[k] || []).push(e); });
    return Object.keys(map).sort().reverse().map(k => {
      const list = map[k].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      const totals = {};
      list.forEach(e => { totals[e.cur] = (totals[e.cur] || 0) + e.ttc; });
      return { key: k, list, totals };
    });
  }
  function totalLabel(totals) { return Object.keys(totals).sort().map(c => money(totals[c], c)).join(' + '); }

  // ---------- CSV & noms de fichiers ----------
  function slug(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ticket';
  }
  /** Nom de la photo quand on la range hors de l'app : `2026-09-12_coop-pronto.jpg`. */
  function ticketName(e) { return e.date + '_' + slug(e.merchant || 'ticket') + '.jpg'; }
  function ticketFiles(list) {
    const used = new Set(), out = {};
    list.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      if (!e.hasImage) return;
      const base = e.date + '_' + slug(e.merchant || 'ticket');
      let name = base, i = 2;
      while (used.has(name)) { name = base + '-' + (i++); }
      used.add(name);
      out[e.id] = 'tickets/' + name + '.jpg';
    });
    return out;
  }
  function csvEscape(s) { s = String(s == null ? '' : s); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csvNum(v) { return v.toFixed(2).replace('.', ','); }
  function csvFor(list, files) {
    const lines = ['Date;Commerçant;Catégorie;Montant TTC;TVA;Montant HT;Devise;Note;Fichier ticket'];
    list.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      lines.push([csvDate(e.date), e.merchant, CATS[e.cat] ? CATS[e.cat].label : e.cat, csvNum(e.ttc), csvNum(e.vat), csvNum(e.ttc - e.vat), e.cur, e.note, files[e.id] || ''].map(csvEscape).join(';'));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // ---------- rendu ----------
  const $app = document.getElementById('app');
  const $overlay = document.getElementById('overlay');
  const $toast = document.getElementById('toast');

  function renderAll() { renderScreen(); renderOverlay(); }
  function renderScreen() { $app.innerHTML = state.view === 'edit' ? editScreen() : listScreen(); }

  function listScreen() {
    const nav = '<div class="navrow"><button class="glass-btn" data-act="settings" aria-label="Réglages">' + icon('gear') + '</button><button class="glass-btn" data-act="add" aria-label="Ajouter une dépense">' + icon('plus') + '</button></div>';
    let body;
    if (state.expenses.length === 0) {
      body = '<div class="scroll"><div class="empty">' + icon('receipt', 56) +
        '<div class="et">Aucune dépense</div>' +
        '<div class="ed">Photographiez un ticket ou saisissez une dépense avec le bouton +.</div>' +
        '<button class="btn-prom" data-act="add">Ajouter une dépense</button></div></div>';
    } else {
      body = '<div class="scroll"><h1 class="large-title">Mes notes de frais</h1><div class="grouped">' +
        groups().map((g, i) =>
          '<section>' +
            '<div class="month-h"><div><div class="mt">' + monthTitle(g.key) + '</div><div class="mc">' + (g.list.length === 1 ? '1 dépense' : g.list.length + ' dépenses') + '</div></div>' +
            '<div><div class="tot">' + totalLabel(g.totals) + '</div><button class="exp" data-act="export" data-month="' + g.key + '">' + icon('share', 15) + 'Exporter le mois</button></div></div>' +
            '<div class="cells">' + g.list.map(row).join('') + '</div>' +
            (i === 0 ? '<div class="foot">« Exporter le mois » donne un relevé PDF, un tableau CSV ou une archive ZIP avec les photos, à ranger dans ' + P.storagePath + '.</div>' : '') +
          '</section>').join('') +
        '</div></div>';
    }
    let banner = '';
    if (!isStandalone && isIOS && !settings.installHintDismissed) {
      banner = '<div class="banner install">' + icon('download', 20) + '<div><div class="bt">Installer l’app</div><div class="bd">Dans Safari : bouton Partager, puis « Sur l’écran d’accueil ».</div></div><button data-act="dismissInstall">OK</button></div>';
    } else if (!isStandalone && !isIOS && installPrompt && !settings.installHintDismissed) {
      banner = '<div class="banner install">' + icon('download', 20) + '<div><div class="bt">Installer l’app</div><div class="bd">Comme une vraie app : icône, plein écran, hors ligne.</div></div><button data-act="installApp">Installer</button><button data-act="dismissInstall">Plus tard</button></div>';
    } else if (!hasAI()) {
      banner = '<div class="banner">' + icon('warn', 20) + '<div><div class="bt">Mode saisie manuelle</div><div class="bd">Aucune clé API : les tickets ne sont pas analysés automatiquement.</div></div><button data-act="settings">Configurer</button></div>';
    }
    return nav + body + banner;
  }

  function row(e) {
    const c = CATS[e.cat] || CATS.other;
    return '<button class="cell icon-row" data-act="edit" data-id="' + esc(e.id) + '">' +
      '<div class="ico">' + icon(c.icon, 19) + '</div>' +
      '<div class="row-main"><div class="t">' + esc(e.merchant || 'Sans commerçant') + '</div><div class="s">' + shortDate(e.date) + ' · ' + c.label + '</div></div>' +
      '<div class="row-amt"><div class="a">' + money(e.ttc, e.cur) + '</div>' + (e.vat > 0 ? '<div class="v">TVA ' + money(e.vat, e.cur) + '</div>' : '') + '</div>' +
      '<span class="chev">' + icon('chev', 16) + '</span></button>';
  }

  function formFields(f, editing) {
    const catOpts = Object.keys(CATS).map(k => '<option value="' + k + '"' + (k === f.cat ? ' selected' : '') + '>' + CATS[k].label + '</option>').join('');
    const curList = CURRENCIES.includes(f.cur) ? CURRENCIES : CURRENCIES.concat([f.cur]);
    const curOpts = curList.map(c => '<option' + (c === f.cur ? ' selected' : '') + '>' + c + '</option>').join('');
    const ht = (f.ttc || 0) - (f.vat || 0);
    return '<div><div class="sec-h">Ticket</div><div class="cells">' +
      '<label class="cell"><span class="fl">Commerçant</span><input class="left" type="text" id="f-merchant" placeholder="Commerçant" autocapitalize="words" value="' + esc(f.merchant) + '"></label>' +
      '<label class="cell"><span class="fl">Date</span><input type="date" id="f-date" value="' + esc(f.date) + '"></label>' +
      '<label class="cell"><span class="fl">Catégorie</span><select id="f-cat">' + catOpts + '</select></label>' +
      '</div></div>' +
      '<div><div class="sec-h">Montants</div><div class="cells">' +
      '<label class="cell"><span class="fl">Montant TTC</span><input id="f-ttc" type="text" inputmode="decimal" placeholder="0.00" value="' + num2(f.ttc) + '"></label>' +
      '<label class="cell"><span class="fl">TVA</span><input id="f-vat" type="text" inputmode="decimal" placeholder="0.00" value="' + num2(f.vat) + '"></label>' +
      '<label class="cell"><span class="fl">Devise</span><select id="f-cur">' + curOpts + '</select></label>' +
      '<div class="cell"><span class="fl">Montant HT</span><span class="val" id="f-ht">' + money(ht, f.cur) + '</span></div>' +
      '</div></div>' +
      '<div><div class="sec-h">Note</div><div class="cells"><label class="cell"><input class="left" type="text" id="f-note" placeholder="Remarque (facultatif)" value="' + esc(f.note) + '"></label></div></div>' +
      (editing ? '<div class="cells"><button class="cell destructive" data-act="askDelete">Supprimer la dépense</button></div>' : '');
  }

  function analysisBlock() {
    switch (state.analysis) {
      case 'running':
        return '<div class="cells"><div class="ai-row"><span class="sp"></span><span style="color:var(--sec);font-size:17px">Analyse du ticket en cours…</span></div></div>';
      case 'success':
        return '<div class="cells"><div class="ai-row ok">' + icon('spark', 18) + '<span>Champs pré-remplis par l’IA. Vérifiez-les avant d’enregistrer.</span></div>' +
          '<button class="cell link" data-act="analyze">' + icon('redo', 18) + '<span>Relancer l’analyse</span></button></div>';
      case 'unavailable':
        return '<div class="cells"><div class="ai-row warn">' + icon('warn', 18) + '<span>Analyse automatique indisponible : aucune clé API. Saisissez les champs manuellement.</span></div></div>';
      case 'ready':
        return '<div><div class="cells"><button class="cell link" data-act="analyze">' + icon('spark', 18) + '<span>Analyser le ticket avec l’IA</span></button></div><div class="foot">Remplace les champs ci-dessous par les valeurs lues sur la photo.</div></div>';
      case 'failed':
        return '<div class="cells"><div class="ai-row err">' + icon('err', 18) + '<span>' + esc(state.analysisError) + '</span></div>' +
          '<button class="cell link" data-act="analyze">' + icon('redo', 18) + '<span>Relancer l’analyse</span></button></div>';
      default:
        return '';
    }
  }

  function formBody(editing) {
    const f = state.draft;
    const photoRow = (editing && f.uploadBlob)
      ? '<div class="cells"><button class="cell link" data-act="sharePhotoCurrent">' + icon('photo', 18) + '<span>Ranger la photo dans Photos ou Fichiers…</span></button></div>'
      : '';
    return '<div class="grouped">' +
      (f.imageUrl ? '<div class="cells"><div class="receipt-wrap"><img src="' + f.imageUrl + '" alt="Photo du ticket"></div></div>' : '') +
      photoRow +
      analysisBlock() +
      formFields(f, editing) +
      '</div>';
  }

  function canSave() { const f = state.draft; return !!f && (f.ttc || 0) > 0 && state.analysis !== 'running' && !state.busy; }

  function editScreen() {
    return '<div class="pushed">' +
      '<div class="nav-inline"><button class="nb" data-act="back">' + icon('back', 20) + 'Retour</button><span class="nt">Dépense</span><button class="nb r" data-act="save"' + (canSave() ? '' : ' disabled') + '>Enregistrer</button></div>' +
      formBody(true) + '</div>';
  }

  function renderOverlay() {
    if (!state.sheet) { $overlay.className = 'overlay'; $overlay.innerHTML = ''; return; }
    $overlay.className = 'overlay on';
    let html = '<button class="dim" data-act="dismiss" aria-label="Fermer"></button>';
    if (state.sheet === 'form') {
      html += '<div class="sheet-card enter" id="sheetCard"><div class="grab"></div>' +
        '<div class="nav-inline"><button class="nb" data-act="dismiss">Annuler</button><span class="nt">Nouvelle dépense</span><button class="nb r" data-act="save"' + (canSave() ? '' : ' disabled') + '>Enregistrer</button></div>' +
        '<div class="body">' + formBody(false) + '</div></div>';
    } else if (state.sheet === 'settings') {
      const foot = hasAI()
        ? 'Les photos de tickets sont envoyées au modèle pour pré-remplir les champs. Rien d’autre ne quitte le téléphone.'
        : 'Sans clé, l’app fonctionne entièrement en saisie manuelle : vous pouvez toujours photographier vos tickets, mais les montants sont à taper vous-même.';
      html += '<div class="sheet-card enter" id="sheetCard"><div class="grab"></div>' +
        '<div class="nav-inline"><span></span><span class="nt">Réglages</span><button class="nb r" data-act="dismiss">OK</button></div>' +
        '<div class="body"><div class="grouped">' +
        '<div><div class="sec-h">Analyse des tickets</div><div class="cells"><div class="cell"><span class="fl">État</span><span class="val">' + aiSourceLabel() + '</span></div><div class="cell"><span class="fl">Modèle</span><span class="val">' + MODEL + '</span></div></div><div class="foot">' + foot + '</div></div>' +
        '<div><div class="sec-h">Clé API Anthropic</div><div class="cells"><label class="cell"><input class="left" type="password" id="s-key" placeholder="sk-ant-…" autocapitalize="none" autocorrect="off" value="' + esc(settings.apiKey) + '"></label>' +
        '<button class="cell link" data-act="saveKey">Enregistrer la clé</button>' +
        (settings.apiKey ? '<button class="cell destructive" data-act="clearKey">Supprimer la clé</button>' : '') +
        '</div><div class="foot">La clé reste dans ce téléphone et n’est envoyée qu’à api.anthropic.com.</div></div>' +
        '<div><div class="sec-h">Relais (facultatif)</div><div class="cells"><label class="cell"><input class="left" type="url" id="s-relay" placeholder="https://…workers.dev" autocapitalize="none" autocorrect="off" value="' + esc(settings.relayUrl) + '"></label>' +
        '<button class="cell link" data-act="saveRelay">Enregistrer le relais</button></div><div class="foot">Si un relais est configuré, la clé est gardée côté serveur et n’a pas besoin d’être saisie ici.</div></div>' +
        '<div><div class="sec-h">Photos des tickets</div><div class="cells">' +
        optionCell('photoSave', 'ask', 'Proposer de ranger chaque photo dans Photos ou Fichiers', settings.photoSave === 'ask') +
        optionCell('photoSave', 'app', 'Garder les photos dans l’app seulement', settings.photoSave === 'app') +
        '</div><div class="foot">Chaque photo reste dans l’app avec sa dépense. En plus, la feuille de partage permet de la ranger où vous voulez : ' + P.photoTargets + '. Aussi disponible plus tard depuis la fiche d’une dépense.</div></div>' +
        '<div><div class="sec-h">Relevés</div><div class="cells">' +
        '<label class="cell"><span class="fl">Nom sur le relevé</span><input type="text" id="s-name" placeholder="Facultatif" autocapitalize="words" value="' + esc(settings.ownerName) + '"></label>' +
        '<button class="cell link" data-act="saveName">Enregistrer le nom</button>' +
        '<button class="cell link" data-act="pdfAll">' + icon('doc', 18) + '<span>Relevé PDF de toutes les dépenses</span></button>' +
        '</div><div class="foot">Le relevé PDF regroupe toutes les dépenses en un tableau avec les totaux, puis les photos des tickets numérotées. Il s’imprime ou s’envoie tel quel. Le relevé d’un seul mois se fait depuis la liste, bouton « Exporter le mois ».</div></div>' +
        '<div><div class="sec-h">Sauvegarde</div><div class="cells"><button class="cell link" data-act="backup">' + icon('download', 18) + '<span>Sauvegarde complète (tous les mois)</span></button></div><div class="foot">Archive ZIP de toutes les dépenses et de tous les tickets. À ranger dans ' + P.storagePath + '. Les données vivent uniquement dans cet appareil : faites-la régulièrement.</div></div>' +
        '<div><div class="sec-h">Installation</div><div class="cells"><div class="cell note">' + (isStandalone ? 'App installée sur l’écran d’accueil.' : 'Pour installer : ' + P.installHow) + '</div>' +
        (!isStandalone && installPrompt ? '<button class="cell link" data-act="installApp">' + icon('download', 18) + '<span>Installer l’app maintenant</span></button>' : '') +
        '</div></div>' +
        '</div></div></div>';
    } else if (state.sheet === 'action') {
      const msg = hasAI()
        ? 'La photo du ticket est analysée automatiquement : montant, TVA, date, commerçant et catégorie seront pré-remplis.'
        : 'Aucune clé API configurée : les champs seront à remplir à la main.';
      html += '<div class="action"><div class="grp"><div class="hd"><b>Nouvelle dépense</b>' + msg + '</div>' +
        '<button data-act="camera">Prendre une photo du ticket</button>' +
        '<button data-act="library">Choisir dans la photothèque</button>' +
        '<button data-act="manual">Saisie manuelle</button></div>' +
        '<div class="grp solo"><button data-act="dismiss">Annuler</button></div></div>';
    } else if (state.sheet === 'confirmDelete') {
      html += '<div class="action"><div class="grp"><div class="hd"><b>Supprimer cette dépense ?</b>La photo du ticket sera supprimée aussi.</div>' +
        '<button class="destructive" data-act="delete">Supprimer</button></div>' +
        '<div class="grp solo"><button data-act="dismiss">Annuler</button></div></div>';
    } else if (state.sheet === 'exportChoice') {
      html += '<div class="action"><div class="grp"><div class="hd"><b>Exporter ' + monthTitle(state.exportMonth) + '</b>Mêmes lignes et mêmes chiffres dans les trois formats. Le PDF se lit et s’imprime ; le CSV s’ouvre dans Numbers ou Excel ; le ZIP ajoute chaque photo en fichier séparé.</div>' +
        '<button data-act="exportPdf">Relevé PDF : tableau + photos, à imprimer</button>' +
        '<button data-act="exportCsv">Tableau CSV seul : Numbers, Excel</button>' +
        '<button data-act="exportZip">Archive ZIP : tableau CSV + photos</button></div>' +
        '<div class="grp solo"><button data-act="dismiss">Annuler</button></div></div>';
    } else if (state.sheet === 'photoSaved') {
      const p = state.photoShare;
      html += '<div class="mini"><div class="grab"></div>' +
        '<div class="file"><div class="fi">JPG</div><div><div class="ft">' + esc(p.name) + '</div><div class="fs">Ticket enregistré dans l’app. Ranger aussi la photo ?</div></div></div>' +
        '<button class="btn-prom" data-act="sharePhoto">Ranger la photo…</button>' +
        '<button class="btn-sec" data-act="dismiss">Pas cette fois</button>' +
        '<div class="foot" style="margin:10px 4px 0">Dans la feuille de partage : ' + P.photoTargets + '.</div></div>';
    } else if (state.sheet === 'archive') {
      const a = state.archive;
      html += '<div class="mini"><div class="grab"></div>' +
        '<div class="file"><div class="fi">' + esc(a.kind || 'ZIP') + '</div><div><div class="ft">' + esc(a.name) + '</div><div class="fs">' + esc(a.summary) + '</div></div></div>' +
        '<button class="btn-prom" data-act="shareArchive">' + P.shareSave + '</button>' +
        '<button class="btn-sec" data-act="dismiss">Fermer</button>' +
        '<div class="foot" style="margin:10px 4px 0">' + P.hint + esc(a.year) + '</div></div>';
    }
    $overlay.innerHTML = html;
    const card = document.getElementById('sheetCard');
    if (card) requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('enter')));
  }
  function optionCell(key, value, label, selected) {
    return '<button class="cell opt" data-act="setOption" data-key="' + key + '" data-val="' + value + '" aria-pressed="' + (selected ? 'true' : 'false') + '"><span>' + label + '</span>' + (selected ? icon('check', 18) : '') + '</button>';
  }

  // ---------- toast ----------
  let toastTimer = null, toastAction = null;
  function toast(msg, onTap, ms) {
    $toast.textContent = msg;
    $toast.classList.add('on');
    $toast.classList.toggle('tap', !!onTap);
    toastAction = onTap || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.classList.remove('on'); toastAction = null; }, ms || 1800);
  }
  function hideToast() { clearTimeout(toastTimer); $toast.classList.remove('on'); toastAction = null; }
  $toast.addEventListener('click', () => { if (toastAction) { const f = toastAction; toastAction = null; $toast.classList.remove('on'); f(); } });

  // ---------- images ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      img.src = url;
    });
  }
  function resizeToJpeg(img, maxDim, quality) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const s = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Conversion impossible')), 'image/jpeg', quality));
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // ---------- analyse par Claude ----------
  const SYSTEM_PROMPT = [
    'You extract structured data from photos of receipts and invoices for the expense report of a French-speaking freelancer based in Switzerland. Read the receipt carefully and fill every field. Rules:',
    '- merchant: the short business name as printed (no address, no legal suffix if avoidable).',
    '- date: the purchase date in ISO format yyyy-MM-dd. Null if unreadable.',
    '- total_ttc: the final amount actually paid, including all taxes and tips, as a number with a dot as decimal separator.',
    '- vat_amount: the total VAT (TVA / MwSt / IVA) amount included in total_ttc. If several VAT lines exist, sum them. If the receipt shows VAT rates but no VAT amount, compute it from the amounts shown. Null if no VAT information at all.',
    '- currency: ISO 4217 code (CHF, EUR, USD...). Infer from symbols, language or country; use CHF when unclear.',
    '- category: the best matching expense category among the allowed values.',
    '- notes: a short French summary of what was bought (max 80 characters), or null.',
    'Never invent amounts: when a value is unreadable, return null. Do not include any text outside the JSON object.'
  ].join('\n');

  function nullable(type, description) { return { anyOf: [{ type }, { type: 'null' }], description }; }
  function requestBody(base64) {
    const categories = Object.keys(CATS).map(k => '- ' + k + ': ' + CATS[k].hint).join('\n');
    return {
      model: MODEL,
      max_tokens: 8192,
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      output_config: {
        effort: 'medium',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              merchant: nullable('string', 'Short merchant name.'),
              date: nullable('string', 'Purchase date, ISO yyyy-MM-dd.'),
              total_ttc: nullable('number', 'Total paid including taxes.'),
              vat_amount: nullable('number', 'Total VAT amount included in total_ttc.'),
              currency: nullable('string', 'ISO 4217 currency code.'),
              category: { type: 'string', enum: Object.keys(CATS), description: 'Expense category.' },
              notes: nullable('string', 'Short French summary, max 80 characters.')
            },
            required: ['merchant', 'date', 'total_ttc', 'vat_amount', 'currency', 'category', 'notes'],
            additionalProperties: false
          }
        }
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Extract the expense data from this receipt photo.\nAllowed categories:\n' + categories }
        ]
      }]
    };
  }
  function httpMessage(status, json) {
    const m = json && json.error && json.error.message;
    if (status === 401) return 'Clé API invalide ou révoquée (401).';
    if (status === 403) return 'Accès refusé par l’API (403). Vérifiez la clé.';
    if (status === 429) return 'Trop de requêtes, réessayez dans un instant (429).';
    if (status >= 500) return 'Service temporairement indisponible (' + status + '). Réessayez.';
    return 'Erreur ' + status + (m ? ' : ' + m : ' du service d’analyse.');
  }
  async function analyzeBlob(blob, signal) {
    const body = JSON.stringify(requestBody(await blobToBase64(blob)));
    const relay = settings.relayUrl.trim();
    const res = relay
      ? await fetch(relay, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal })
      : await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': settings.apiKey.trim(),
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'server-side-fallback-2026-07-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body, signal
        });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(httpMessage(res.status, json));
    if (!json) throw new Error('Réponse inattendue du service d’analyse.');
    if (json.stop_reason === 'refusal') throw new Error('Le service a refusé d’analyser cette image.');
    if (json.stop_reason === 'max_tokens') throw new Error('Réponse incomplète du service. Réessayez.');
    const block = (json.content || []).find(b => b.type === 'text');
    if (!block) throw new Error('Réponse inattendue du service d’analyse.');
    try { return JSON.parse(block.text); } catch (e) { throw new Error('Réponse illisible du service d’analyse.'); }
  }
  function applyExtraction(r) {
    const f = state.draft;
    if (r.merchant && String(r.merchant).trim()) f.merchant = String(r.merchant).trim();
    if (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date)) f.date = r.date.slice(0, 10);
    if (typeof r.total_ttc === 'number' && r.total_ttc > 0) f.ttc = r.total_ttc;
    if (typeof r.vat_amount === 'number' && r.vat_amount >= 0) f.vat = r.vat_amount;
    if (r.currency && /^[A-Za-z]{3}$/.test(String(r.currency).trim())) f.cur = String(r.currency).trim().toUpperCase();
    if (r.category && CATS[r.category]) f.cat = r.category;
    if (r.notes && String(r.notes).trim() && !f.note) f.note = String(r.notes).trim();
  }
  async function analyze() {
    const f = state.draft;
    if (!f || !f.uploadBlob) return;
    if (!hasAI()) { state.analysis = 'unavailable'; rerenderForm(); return; }
    if (state.abort) state.abort.abort();
    const ctrl = new AbortController();
    state.abort = ctrl;
    state.analysis = 'running';
    rerenderForm();
    try {
      const result = await analyzeBlob(f.uploadBlob, ctrl.signal);
      if (ctrl.signal.aborted) return;
      applyExtraction(result);
      state.analysis = 'success';
    } catch (e) {
      if (ctrl.signal.aborted) return;
      state.analysis = 'failed';
      state.analysisError = !navigator.onLine ? 'Pas de connexion internet. Saisissez les champs à la main ou réessayez plus tard.' : errText(e, 'Analyse impossible.');
    } finally {
      if (state.abort === ctrl) state.abort = null;
    }
    rerenderForm();
  }
  function rerenderForm() { if (state.sheet === 'form') renderOverlay(); else if (state.view === 'edit') renderScreen(); }

  // ---------- brouillon ----------
  function newDraft() {
    return { id: null, date: todayISO(), merchant: '', ttc: null, vat: null, cur: settings.currency || 'CHF', cat: 'other', note: '', imageBlob: null, uploadBlob: null, imageUrl: '', hasImage: false, createdAt: Date.now() };
  }
  function releaseDraft() {
    if (state.abort) { state.abort.abort(); state.abort = null; }
    if (state.draft && state.draft.imageUrl) URL.revokeObjectURL(state.draft.imageUrl);
    state.draft = null;
    state.analysis = 'idle';
    state.analysisError = '';
  }
  function readForm() {
    const f = state.draft; if (!f) return;
    const g = id => document.getElementById(id);
    if (g('f-merchant')) f.merchant = g('f-merchant').value;
    if (g('f-date') && g('f-date').value) f.date = g('f-date').value;
    if (g('f-cat')) f.cat = g('f-cat').value;
    if (g('f-cur')) f.cur = g('f-cur').value;
    if (g('f-note')) f.note = g('f-note').value;
    if (g('f-ttc')) f.ttc = parseNum(g('f-ttc').value);
    if (g('f-vat')) f.vat = parseNum(g('f-vat').value);
  }
  function refreshComputed() {
    readForm();
    const f = state.draft; if (!f) return;
    const ht = document.getElementById('f-ht');
    if (ht) ht.textContent = money((f.ttc || 0) - (f.vat || 0), f.cur);
    document.querySelectorAll('[data-act="save"]').forEach(b => { b.disabled = !canSave(); });
  }

  async function handleFile(file) {
    if (!file) return;
    state.sheet = null; renderOverlay();
    state.busy = true;
    try {
      const img = await loadImage(file);
      const storageBlob = await resizeToJpeg(img, 2000, 0.85);
      const uploadBlob = await resizeToJpeg(img, 1600, 0.8);
      URL.revokeObjectURL(img.src);
      releaseDraft();
      const d = newDraft();
      d.imageBlob = storageBlob; d.uploadBlob = uploadBlob; d.hasImage = true;
      d.imageUrl = URL.createObjectURL(storageBlob);
      state.draft = d;
      state.busy = false;
      state.analysis = hasAI() ? 'idle' : 'unavailable';
      state.sheet = 'form';
      renderOverlay();
      if (hasAI()) analyze();
    } catch (e) {
      state.busy = false;
      toast('Photo illisible : ' + errText(e, 'réessayez.'), null, 3000);
    }
  }

  async function save() {
    readForm();
    if (!canSave()) return;
    const f = state.draft;
    state.busy = true;
    try {
      const id = f.id || uid();
      const record = {
        id, date: f.date, merchant: f.merchant.trim(), ttc: f.ttc, vat: f.vat || 0, cur: f.cur, cat: f.cat, note: f.note.trim(),
        hasImage: !!(f.hasImage || f.imageBlob), createdAt: f.createdAt || Date.now()
      };
      await store.put(record);
      if (f.imageBlob) await store.putImage(id, f.imageBlob);
      const newPhoto = f.imageBlob ? { blob: f.imageBlob, name: ticketName(record) } : null;
      settings.currency = f.cur; saveSettings();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      await reload();
      releaseDraft();
      state.sheet = null; state.view = 'list'; state.editing = null;
      if (newPhoto && settings.photoSave === 'ask') {
        state.photoShare = newPhoto;
        state.sheet = 'photoSaved';
      }
      renderAll();
      toast('Enregistré');
    } catch (e) {
      toast('Enregistrement impossible : ' + errText(e, 'erreur de stockage'), null, 3500);
    } finally {
      state.busy = false;
    }
  }

  async function openEdit(id) {
    const e = state.expenses.find(x => x.id === id);
    if (!e) return;
    releaseDraft();
    const d = Object.assign(newDraft(), { id: e.id, date: e.date, merchant: e.merchant, ttc: e.ttc, vat: e.vat > 0 ? e.vat : null, cur: e.cur, cat: e.cat, note: e.note, hasImage: e.hasImage, createdAt: e.createdAt });
    state.draft = d;
    if (e.hasImage) {
      const blob = await store.image(e.id).catch(() => null);
      if (blob) { d.imageUrl = URL.createObjectURL(blob); d.uploadBlob = blob; }
    }
    state.analysis = d.uploadBlob ? (hasAI() ? 'ready' : 'unavailable') : 'idle';
    state.editing = e.id;
    state.view = 'edit';
    renderScreen();
    window.scrollTo(0, 0);
  }

  async function deleteCurrent() {
    const id = state.editing;
    state.sheet = null;
    if (id) {
      await store.remove(id).catch(() => {});
      await store.removeImage(id).catch(() => {});
      await reload();
    }
    releaseDraft();
    state.view = 'list'; state.editing = null;
    renderAll();
    toast('Dépense supprimée');
  }

  // ---------- archives ZIP ----------
  async function buildArchive(list, name, perMonth) {
    if (typeof JSZip === 'undefined') throw new Error('Composant ZIP non chargé. Rechargez l’app.');
    const zip = new JSZip();
    let count = 0;
    const months = {};
    list.forEach(e => { (months[e.date.slice(0, 7)] = months[e.date.slice(0, 7)] || []).push(e); });
    for (const key of Object.keys(months).sort()) {
      const items = months[key];
      const files = ticketFiles(items);
      const folder = perMonth ? zip.folder('notes-de-frais-' + key) : zip;
      folder.file('notes-de-frais-' + key + '.csv', csvFor(items, files));
      for (const e of items) {
        const path = files[e.id];
        if (!path) continue;
        const blob = await store.image(e.id).catch(() => null);
        if (blob) { folder.file(path, blob); count++; }
      }
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { blob, count };
  }
  function sizeLabel(bytes) { return bytes < 1048576 ? Math.max(1, Math.round(bytes / 1024)) + ' Ko' : (bytes / 1048576).toFixed(1).replace('.', ',') + ' Mo'; }
  async function exportMonth(key) {
    const g = groups().find(x => x.key === key);
    if (!g) return;
    toast('Préparation de l’archive…', null, 4000);
    try {
      const { blob, count } = await buildArchive(g.list, key, false);
      state.archive = { blob, kind: 'ZIP', type: 'application/zip', name: 'notes-de-frais-' + key + '.zip', summary: 'CSV + ' + count + (count === 1 ? ' ticket' : ' tickets') + ' · ' + sizeLabel(blob.size), year: key.slice(0, 4) };
      hideToast();
      state.sheet = 'archive'; renderOverlay();
    } catch (e) { toast('Export impossible : ' + errText(e, 'erreur'), null, 3500); }
  }
  function exportCsvMonth(key) {
    const g = groups().find(x => x.key === key);
    if (!g) return;
    const blob = new Blob([csvFor(g.list, ticketFiles(g.list))], { type: 'text/csv' });
    state.archive = { blob, kind: 'CSV', type: 'text/csv', name: 'notes-de-frais-' + key + '.csv', summary: g.list.length + (g.list.length === 1 ? ' dépense' : ' dépenses') + ' · s’ouvre dans Numbers ou Excel · ' + sizeLabel(blob.size), year: key.slice(0, 4) };
    state.sheet = 'archive'; renderOverlay();
  }
  async function backupAll() {
    if (!state.expenses.length) { toast('Aucune dépense à sauvegarder'); return; }
    toast('Préparation de la sauvegarde…', null, 6000);
    try {
      const { blob, count } = await buildArchive(state.expenses, 'all', true);
      const stamp = todayISO();
      state.archive = { blob, kind: 'ZIP', type: 'application/zip', name: 'sauvegarde-notes-de-frais-' + stamp + '.zip', summary: state.expenses.length + ' dépenses · ' + count + ' tickets · ' + sizeLabel(blob.size), year: stamp.slice(0, 4) };
      hideToast();
      state.sheet = 'archive'; renderOverlay();
    } catch (e) { toast('Sauvegarde impossible : ' + errText(e, 'erreur'), null, 3500); }
  }

  // ---------- relevé PDF ----------
  function pdfNum(v) { return v.toFixed(2).replace('.', ','); }
  function pdfText(s) { return String(s == null ? '' : s).replace(/[…]/g, '...').replace(/[‘’]/g, '\'').replace(/[“”]/g, '"'); }
  async function buildPdf(list, title) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Composant PDF non chargé. Rechargez l’app.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false });
    const W = 210, H = 297, M = 15, CW = W - 2 * M;
    const sorted = list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const owner = (settings.ownerName || '').trim();
    let pageNo = 1;

    const footer = () => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(133, 123, 112);
      doc.text(pdfText(title + (owner ? ' - ' + owner : '')), M, H - 8);
      doc.text('page ' + pageNo, W - M, H - 8, { align: 'right' });
      doc.setTextColor(43, 38, 34);
    };
    const newPage = () => { footer(); doc.addPage(); pageNo++; };

    // En-tête
    doc.setTextColor(43, 38, 34);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text(pdfText(title), M, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(133, 123, 112);
    doc.text(pdfText([owner, 'Relevé généré le ' + csvDate(todayISO()), sorted.length + (sorted.length === 1 ? ' dépense' : ' dépenses')].filter(Boolean).join('  |  ')), M, 29);
    doc.setTextColor(43, 38, 34);

    // Tableau
    const cols = [
      { k: 'n', w: 10, h: 'N°' },
      { k: 'date', w: 22, h: 'Date' },
      { k: 'merchant', w: 56, h: 'Commerçant' },
      { k: 'cat', w: 34, h: 'Catégorie' },
      { k: 'ttc', w: 24, h: 'TTC', r: true },
      { k: 'vat', w: 16, h: 'TVA', r: true },
      { k: 'ht', w: 18, h: 'HT', r: true }
    ];
    const rowH = 7;
    let y = 40;
    const header = () => {
      doc.setFillColor(243, 237, 227); doc.rect(M, y - 5, CW, rowH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      let x = M + 2;
      cols.forEach(c => { doc.text(pdfText(c.h), c.r ? x + c.w - 2 : x, y, c.r ? { align: 'right' } : undefined); x += c.w; });
      y += rowH;
      doc.setFont('helvetica', 'normal');
    };
    header();
    const totals = {};
    sorted.forEach((e, i) => {
      if (y > H - 30) { newPage(); y = 20; header(); }
      if (i % 2 === 1) { doc.setFillColor(252, 249, 244); doc.rect(M, y - 5, CW, rowH, 'F'); }
      totals[e.cur] = totals[e.cur] || { ttc: 0, vat: 0 };
      totals[e.cur].ttc += e.ttc; totals[e.cur].vat += e.vat;
      const vals = {
        n: String(i + 1), date: csvDate(e.date), merchant: e.merchant || '-',
        cat: CATS[e.cat] ? CATS[e.cat].label : e.cat, ttc: pdfNum(e.ttc) + ' ' + e.cur, vat: pdfNum(e.vat), ht: pdfNum(e.ttc - e.vat)
      };
      let x = M + 2;
      cols.forEach(c => {
        const t = doc.splitTextToSize(pdfText(vals[c.k]), c.w - 3)[0] || '';
        doc.text(t, c.r ? x + c.w - 2 : x, y, c.r ? { align: 'right' } : undefined);
        x += c.w;
      });
      y += rowH;
    });
    // Totaux
    Object.keys(totals).sort().forEach(cur => {
      if (y > H - 30) { newPage(); y = 20; }
      doc.setDrawColor(228, 218, 203); doc.line(M, y - 5, M + CW, y - 5);
      doc.setFont('helvetica', 'bold');
      const xTTC = M + 2 + cols.slice(0, 5).reduce((s, c) => s + c.w, 0) - 2;
      doc.text('Total ' + cur, M + 2 + cols[0].w + cols[1].w, y);
      doc.text(pdfNum(totals[cur].ttc) + ' ' + cur, xTTC, y, { align: 'right' });
      doc.text(pdfNum(totals[cur].vat), xTTC + cols[5].w, y, { align: 'right' });
      doc.text(pdfNum(totals[cur].ttc - totals[cur].vat), xTTC + cols[5].w + cols[6].w, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += rowH;
    });

    // Justificatifs : 2 x 2 photos par page, numéros = lignes du tableau
    const withImage = sorted.map((e, i) => ({ e, n: i + 1 })).filter(x => x.e.hasImage);
    let photos = 0;
    if (withImage.length) {
      newPage(); y = 20;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('Justificatifs', M, y); y += 8;
      const boxW = (CW - 8) / 2, boxH = 112, capH = 9;
      let slot = 0;
      for (const { e, n } of withImage) {
        const blob = await store.image(e.id).catch(() => null);
        if (!blob) continue;
        if (slot === 4) { newPage(); y = 20; slot = 0; }
        const col = slot % 2, row = Math.floor(slot / 2);
        const x0 = M + col * (boxW + 8), y0 = y + row * (boxH + capH + 6);
        const img = await loadImage(blob);
        const small = await resizeToJpeg(img, 1200, 0.72);
        URL.revokeObjectURL(img.src);
        const ratio = img.naturalWidth / img.naturalHeight;
        let w = boxW, h = w / ratio;
        if (h > boxH) { h = boxH; w = h * ratio; }
        const dataUrl = 'data:image/jpeg;base64,' + await blobToBase64(small);
        doc.setFillColor(243, 237, 227); doc.rect(x0, y0, boxW, boxH, 'F');
        doc.addImage(dataUrl, 'JPEG', x0 + (boxW - w) / 2, y0 + (boxH - h) / 2, w, h);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(pdfText('N° ' + n + ' - ' + csvDate(e.date) + ' - ' + (e.merchant || '-')), x0, y0 + boxH + 5);
        doc.setFont('helvetica', 'normal');
        doc.text(pdfText(pdfNum(e.ttc) + ' ' + e.cur + (e.note ? ' - ' + e.note : '')), x0, y0 + boxH + 9, { maxWidth: boxW });
        photos++;
        slot++;
      }
    }
    footer();
    return { blob: doc.output('blob'), pages: pageNo, photos };
  }
  async function exportPdfMonth(key) {
    const g = groups().find(x => x.key === key);
    if (!g) return;
    toast('Préparation du relevé…', null, 8000);
    try {
      const { blob, pages, photos } = await buildPdf(g.list, 'Notes de frais - ' + monthTitle(key));
      state.archive = { blob, kind: 'PDF', type: 'application/pdf', name: 'releve-notes-de-frais-' + key + '.pdf', summary: pages + (pages === 1 ? ' page' : ' pages') + ' · ' + g.list.length + (g.list.length === 1 ? ' dépense' : ' dépenses') + ' · ' + photos + (photos === 1 ? ' photo' : ' photos') + ' · ' + sizeLabel(blob.size), year: key.slice(0, 4) };
      hideToast();
      state.sheet = 'archive'; renderOverlay();
    } catch (e) { toast('Relevé impossible : ' + errText(e, 'erreur'), null, 3500); }
  }
  async function exportPdfAll() {
    if (!state.expenses.length) { toast('Aucune dépense'); return; }
    toast('Préparation du relevé…', null, 10000);
    try {
      const { blob, pages, photos } = await buildPdf(state.expenses, 'Notes de frais - toutes les dépenses');
      const stamp = todayISO();
      state.archive = { blob, kind: 'PDF', type: 'application/pdf', name: 'releve-notes-de-frais-complet-' + stamp + '.pdf', summary: pages + ' pages · ' + state.expenses.length + ' dépenses · ' + photos + ' photos · ' + sizeLabel(blob.size), year: stamp.slice(0, 4) };
      hideToast();
      state.sheet = 'archive'; renderOverlay();
    } catch (e) { toast('Relevé impossible : ' + errText(e, 'erreur'), null, 3500); }
  }
  /** Partage un fichier via la feuille système ; repli en téléchargement. Appeler depuis un geste utilisateur. */
  async function shareFile(blob, name, type) {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return true; }
      catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }
  async function sharePhoto() {
    const p = state.photoShare; if (!p) return;
    const done = await shareFile(p.blob, p.name, 'image/jpeg');
    if (done) { state.photoShare = null; if (state.sheet === 'photoSaved') { state.sheet = null; renderOverlay(); } }
  }
  async function shareArchive() {
    const a = state.archive; if (!a) return;
    const done = await shareFile(a.blob, a.name, a.type || 'application/zip');
    if (done) { state.sheet = null; renderOverlay(); }
  }

  // ---------- actions ----------
  function act(el) {
    const a = el.getAttribute('data-act');
    switch (a) {
      case 'add': state.sheet = 'action'; renderOverlay(); break;
      case 'settings': state.sheet = 'settings'; renderOverlay(); break;
      case 'dismiss':
        if (state.sheet === 'form') releaseDraft();
        state.sheet = null; state.archive = null; state.photoShare = null; state.exportMonth = null; renderOverlay(); break;
      case 'setOption': {
        const key = el.getAttribute('data-key'), val = el.getAttribute('data-val');
        if (key === 'photoSave' && (val === 'ask' || val === 'app')) { settings.photoSave = val; saveSettings(); renderOverlay(); }
        break;
      }
      case 'sharePhoto': sharePhoto(); break;
      case 'sharePhotoCurrent': {
        const f = state.draft;
        if (!f || !f.uploadBlob) break;
        readForm();
        state.photoShare = { blob: f.uploadBlob, name: ticketName({ date: f.date, merchant: f.merchant }) };
        sharePhoto();
        break;
      }
      case 'dismissInstall': settings.installHintDismissed = true; saveSettings(); renderScreen(); break;
      case 'installApp': {
        const p = installPrompt;
        if (p && typeof p.prompt === 'function') {
          p.prompt();
          Promise.resolve(p.userChoice).then(() => { installPrompt = null; renderAll(); }).catch(() => {});
        } else {
          toast(P.installHow, null, 5000);
        }
        break;
      }
      case 'camera': document.getElementById('pickCamera').click(); break;
      case 'library': document.getElementById('pickLibrary').click(); break;
      case 'manual': releaseDraft(); state.draft = newDraft(); state.analysis = 'idle'; state.sheet = 'form'; renderOverlay(); break;
      case 'analyze': readForm(); analyze(); break;
      case 'save': save(); break;
      case 'export': state.exportMonth = el.getAttribute('data-month'); state.sheet = 'exportChoice'; renderOverlay(); break;
      case 'exportZip': { const k = state.exportMonth; state.sheet = null; renderOverlay(); exportMonth(k); break; }
      case 'exportPdf': { const k = state.exportMonth; state.sheet = null; renderOverlay(); exportPdfMonth(k); break; }
      case 'exportCsv': { const k = state.exportMonth; state.sheet = null; renderOverlay(); exportCsvMonth(k); break; }
      case 'pdfAll': exportPdfAll(); break;
      case 'saveName': {
        const v = (document.getElementById('s-name') || {}).value || '';
        settings.ownerName = v.trim(); saveSettings(); renderOverlay(); toast(settings.ownerName ? 'Nom enregistré' : 'Nom effacé'); break;
      }
      case 'edit': openEdit(el.getAttribute('data-id')); break;
      case 'back': releaseDraft(); state.view = 'list'; state.editing = null; renderScreen(); break;
      case 'askDelete': state.sheet = 'confirmDelete'; renderOverlay(); break;
      case 'delete': deleteCurrent(); break;
      case 'saveKey': {
        const v = (document.getElementById('s-key') || {}).value || '';
        settings.apiKey = v.trim(); saveSettings(); renderAll(); toast(settings.apiKey ? 'Clé enregistrée' : 'Clé effacée'); break;
      }
      case 'clearKey': settings.apiKey = ''; saveSettings(); renderAll(); toast('Clé supprimée'); break;
      case 'saveRelay': {
        const v = (document.getElementById('s-relay') || {}).value || '';
        settings.relayUrl = v.trim(); saveSettings(); renderAll(); toast(settings.relayUrl ? 'Relais enregistré' : 'Relais effacé'); break;
      }
      case 'backup': backupAll(); break;
      case 'shareArchive': shareArchive(); break;
    }
  }

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (el) act(el);
  });
  document.addEventListener('input', ev => { if (ev.target.matches('#app input, #app select, #overlay input, #overlay select')) refreshComputed(); });
  document.addEventListener('change', ev => { if (ev.target.matches('#app select, #overlay select, #app input[type="date"], #overlay input[type="date"]')) refreshComputed(); });
  document.getElementById('pickCamera').addEventListener('change', ev => { handleFile(ev.target.files[0]); ev.target.value = ''; });
  document.getElementById('pickLibrary').addEventListener('change', ev => { handleFile(ev.target.files[0]); ev.target.value = ''; });
  window.addEventListener('keydown', ev => { if (ev.key === 'Escape' && state.sheet) act({ getAttribute: () => 'dismiss' }); });

  // ---------- chargement ----------
  async function reload() {
    try { state.expenses = await store.all(); }
    catch (e) { state.expenses = []; toast('Stockage local indisponible : ' + errText(e, 'ouverture refusée'), null, 4000); }
  }
  async function init() {
    await reload();
    renderAll();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              toast('Nouvelle version prête. Touchez pour recharger.', () => location.reload(), 10000);
            }
          });
        });
      }).catch(() => {});
    }
  }
  init();
})();
