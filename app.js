(() => {
  'use strict';

  /* ====== マスターデータ ====== */
  const REGIONS = [
    { name: '北海道・東北', prefs: ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
    { name: '関東', prefs: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
    { name: '中部', prefs: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
    { name: '近畿', prefs: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
    { name: '中国・四国', prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県'] },
    { name: '九州・沖縄', prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
  ];
  const PREFS = REGIONS.flatMap(r => r.prefs);

  const CATEGORIES = [
    { id: 'nature',   label: '自然',          icon: '🌲', color: '#2f7d4f' },
    { id: 'kids',     label: '子ども・家族',  icon: '🧸', color: '#e08a1e' },
    { id: 'date',     label: 'デート',        icon: '💕', color: '#d24a74' },
    { id: 'history',  label: '歴史・文化',    icon: '⛩️', color: '#8a3b2e' },
    { id: 'scenic',   label: '絶景',          icon: '🌅', color: '#3b5fa8' },
    { id: 'onsen',    label: '温泉',          icon: '♨️', color: '#b1543a' },
    { id: 'gourmet',  label: 'グルメ',        icon: '🍜', color: '#a0761b' },
    { id: 'activity', label: 'アクティビティ', icon: '🚣', color: '#18808a' },
  ];
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  /* ====== ストレージ ====== */
  const KEY_SPOTS = 'jpkanko.spots.v2';
  const KEY_LIKED = 'jpkanko.liked.v2';
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 保存不可でも動作継続 */ } },
    remove(key) { try { localStorage.removeItem(key); } catch {} },
  };

  // seed.js のカテゴリ記号 → カテゴリID
  const CODE = { N: 'nature', K: 'kids', D: 'date', H: 'history', S: 'scenic', O: 'onsen', G: 'gourmet', A: 'activity' };
  // 名前から決まる疑似乱数（毎回同じいいね数になるように）
  const hash = s => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);

  const seedSpots = () => {
    const data = window.SEED_DATA || {};
    const out = [];
    for (const pref of PREFS) {
      const [top, ...items] = data[pref] || [0];
      let likes = top;
      items.forEach(([name, codes, desc], i) => {
        if (i > 0) likes = Math.max(1, likes - (3 + hash(name) % 9));
        out.push({
          id: `seed-${pref}-${i}`, pref, name, cats: [...codes].map(c => CODE[c]).filter(Boolean),
          desc, img: '', likes, own: false, createdAt: 0,
        });
      });
    }
    return out;
  };

  // 旧バージョン(v1)で自分が登録した名所は引き継ぐ
  function loadSpots() {
    const saved = store.get(KEY_SPOTS);
    if (saved) return saved;
    const old = (store.get('jpkanko.spots.v1') || []).filter(s => s.own);
    return [...seedSpots(), ...old];
  }

  let spots = loadSpots();
  let liked = new Set(store.get(KEY_LIKED) || (store.get('jpkanko.liked.v1') || []).filter(id => id.startsWith('u-')));
  const saveAll = () => { store.set(KEY_SPOTS, spots); store.set(KEY_LIKED, [...liked]); };

  /* ====== 状態 ====== */
  const state = {
    category: 'all',
    region: 0,
    pref: '東京都',
    showAllNational: false,
  };

  /* ====== ユーティリティ ====== */
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortPref = p => (p === '北海道' ? p : p.replace(/[都府県]$/, ''));
  const matchCat = s => state.category === 'all' || s.cats.includes(state.category);
  const bySCore = (a, b) => b.likes - a.likes || a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'ja');

  const heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.1 8.4 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5c3.4 0 5.5 3.4 4.1 6.8C19.5 16.4 12 21 12 21z"/></svg>';

  function thumb(s) {
    const c = CAT[s.cats[0]] || CATEGORIES[0];
    const c2 = CAT[s.cats[1]] || c;
    const img = s.img ? `<img src="${esc(s.img)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    return `<div class="thumb" style="--th: linear-gradient(135deg, ${c.color}, ${c2.color === c.color ? '#00000055' : c2.color})"><span class="thumb-initial">${esc(s.name.charAt(0))}</span>${img}</div>`;
  }
  const tags = s => `<div class="tags">${s.cats.map(id => CAT[id] ? `<span class="tag">${CAT[id].icon} ${CAT[id].label}</span>` : '').join('')}</div>`;
  const likeBtn = s => `<button class="like-btn${liked.has(s.id) ? ' liked' : ''}" data-like="${esc(s.id)}" aria-pressed="${liked.has(s.id)}" aria-label="${esc(s.name)}にいいね">${heartSvg}<span>${s.likes}</span></button>`;

  /* ====== カテゴリチップ ====== */
  function renderChips() {
    const all = [{ id: 'all', label: 'すべて', icon: '🗾' }, ...CATEGORIES];
    $('#category-chips').innerHTML = all.map(c =>
      `<button class="chip" data-cat="${c.id}" aria-pressed="${state.category === c.id}"><span aria-hidden="true">${c.icon}</span>${c.label}</button>`
    ).join('');
  }

  /* ====== 全国No.1ランキング ====== */
  function nationalRanking() {
    const tops = [];
    for (const pref of PREFS) {
      const list = spots.filter(s => s.pref === pref && matchCat(s)).sort(bySCore);
      if (list.length) tops.push(list[0]);
    }
    return tops.sort(bySCore);
  }

  function renderNational() {
    const ranked = nationalRanking();
    const cat = CAT[state.category];
    $('#national-filter-note').textContent = cat ? `（「${cat.label}」で絞り込み中：${ranked.length}都道府県）` : '';

    const podium = ranked.slice(0, 3);
    $('#national-podium').innerHTML = podium.length ? podium.map((s, i) => `
      <article class="podium-card rank-${i + 1}">
        <span class="medal">${i + 1}</span>
        ${thumb(s)}
        <div class="podium-body">
          <span class="pref-badge">${esc(s.pref)} No.1</span>
          <h3>${esc(s.name)}</h3>
          ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
          <div class="podium-foot">${tags(s)}${likeBtn(s)}</div>
        </div>
      </article>`).join('')
      : `<p class="empty" style="grid-column:1/-1">このカテゴリの名所はまだありません。<a href="#register">最初の1件を登録</a>しませんか？</p>`;

    const rest = ranked.slice(3);
    const limit = state.showAllNational ? rest.length : 7;
    $('#national-list').innerHTML = rest.slice(0, limit).map((s, i) => `
      <li class="row">
        <span class="row-rank">${i + 4}</span>
        ${thumb(s)}
        <div class="row-main">
          <span class="pref-badge">${esc(s.pref)} No.1</span>
          <h4>${esc(s.name)}</h4>
          ${tags(s)}
        </div>
        ${likeBtn(s)}
      </li>`).join('');
    const more = $('#national-more');
    more.hidden = rest.length <= 7;
    more.textContent = state.showAllNational ? '閉じる' : `残り${rest.length - 7}件を表示`;
  }

  /* ====== 都道府県別 ====== */
  function renderRegions() {
    $('#region-tabs').innerHTML = REGIONS.map((r, i) =>
      `<button class="region-tab" role="tab" data-region="${i}" aria-selected="${state.region === i}">${r.name}</button>`
    ).join('');
  }

  function renderPrefGrid() {
    const prefs = REGIONS[state.region].prefs;
    $('#pref-grid').innerHTML = prefs.map(p => {
      const n = spots.filter(s => s.pref === p && matchCat(s)).length;
      return `<button class="pref-btn" data-pref="${p}" aria-pressed="${state.pref === p}"><strong>${shortPref(p)}</strong><small>${n}件</small></button>`;
    }).join('');
  }

  function renderPrefRanking() {
    const list = spots.filter(s => s.pref === state.pref && matchCat(s)).sort(bySCore);
    const cat = CAT[state.category];
    $('#pref-title').textContent = `${state.pref}ランキング`;
    $('#pref-count').textContent = `${cat ? cat.label + '・' : ''}${list.length}件`;
    $('#pref-list').innerHTML = list.length ? list.map((s, i) => `
      <li class="spot${i === 0 ? ' top' : ''}" id="spot-${esc(s.id)}">
        <span class="row-rank">${i + 1}</span>
        ${thumb(s)}
        <div class="row-main">
          <h4>${esc(s.name)}</h4>
          ${tags(s)}
          ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
        </div>
        <div class="spot-actions">
          ${s.own ? '<span class="own-badge">あなたの登録</span>' : ''}
          ${likeBtn(s)}
          ${s.own ? `<button class="delete-btn" data-delete="${esc(s.id)}">削除</button>` : ''}
        </div>
      </li>`).join('')
      : `<li class="empty">${esc(state.pref)}には${cat ? `「${cat.label}」の` : ''}名所がまだありません。<a href="#register" data-prefill="${esc(state.pref)}">名所を登録する</a></li>`;
  }

  /* ====== ヒーロー統計 ====== */
  function renderStats() {
    $('#stat-spots').textContent = spots.length.toLocaleString();
    $('#stat-prefs').innerHTML = `${new Set(spots.map(s => s.pref)).size}<small>/47</small>`;
    $('#stat-likes').textContent = spots.reduce((a, s) => a + s.likes, 0).toLocaleString();
  }

  function renderAll() {
    renderChips();
    renderNational();
    renderRegions();
    renderPrefGrid();
    renderPrefRanking();
    renderStats();
  }

  /* ====== 登録フォーム ====== */
  function initForm() {
    $('#f-pref').innerHTML = '<option value="">選択してください</option>' +
      REGIONS.map(r => `<optgroup label="${r.name}">${r.prefs.map(p => `<option>${p}</option>`).join('')}</optgroup>`).join('');
    $('#f-cats').innerHTML = CATEGORIES.map(c =>
      `<label><input type="checkbox" name="cats" value="${c.id}"><span>${c.icon} ${c.label}</span></label>`
    ).join('');

    $('#register-form').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      const pref = f.pref.value;
      const cats = [...f.querySelectorAll('input[name="cats"]:checked')].map(i => i.value);
      const desc = f.desc.value.trim();
      const img = f.img.value.trim();
      const err = $('#form-error');

      if (!name) return (err.textContent = '名所の名前を入力してください。', f.name.focus());
      if (!pref) return (err.textContent = '都道府県を選択してください。', f.pref.focus());
      if (!cats.length) return (err.textContent = 'カテゴリを1つ以上選んでください。');
      if (img && !/^https?:\/\//i.test(img)) return (err.textContent = '画像URLは http(s):// から始まるURLを入力してください。', f.img.focus());
      if (spots.some(s => s.pref === pref && s.name === name)) return (err.textContent = `「${name}」は${pref}にすでに登録されています。いいねで応援しましょう！`);
      err.textContent = '';

      const spot = { id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), pref, name, cats, desc, img, likes: 0, own: true, createdAt: Date.now() };
      spots.push(spot);
      saveAll();
      f.reset();

      // 登録した県のランキングへ移動
      state.region = REGIONS.findIndex(r => r.prefs.includes(pref));
      state.pref = pref;
      if (state.category !== 'all' && !cats.includes(state.category)) state.category = 'all';
      renderAll();
      toast(`「${name}」を登録しました！`);
      requestAnimationFrame(() => {
        const el = document.getElementById('spot-' + spot.id);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); }
      });
    });
  }

  /* ====== イベント ====== */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-cat]');
      if (chip) {
        state.category = chip.dataset.cat;
        state.showAllNational = false;
        renderAll();
        return;
      }
      const region = e.target.closest('[data-region]');
      if (region) {
        state.region = +region.dataset.region;
        state.pref = REGIONS[state.region].prefs[0];
        renderRegions(); renderPrefGrid(); renderPrefRanking();
        return;
      }
      const pref = e.target.closest('[data-pref]');
      if (pref) {
        state.pref = pref.dataset.pref;
        renderPrefGrid(); renderPrefRanking();
        return;
      }
      const like = e.target.closest('[data-like]');
      if (like) {
        const s = spots.find(x => x.id === like.dataset.like);
        if (!s) return;
        if (liked.has(s.id)) { liked.delete(s.id); s.likes = Math.max(0, s.likes - 1); }
        else { liked.add(s.id); s.likes += 1; }
        saveAll();
        renderNational(); renderPrefRanking(); renderStats();
        document.querySelectorAll(`[data-like="${CSS.escape(s.id)}"]`).forEach(b => b.classList.add('pop'));
        return;
      }
      const del = e.target.closest('[data-delete]');
      if (del) {
        const s = spots.find(x => x.id === del.dataset.delete);
        if (!s || !s.own) return;
        if (!confirm(`「${s.name}」を削除しますか？`)) return;
        spots = spots.filter(x => x.id !== s.id);
        liked.delete(s.id);
        saveAll(); renderAll();
        toast('削除しました');
        return;
      }
      const prefill = e.target.closest('[data-prefill]');
      if (prefill) $('#f-pref').value = prefill.dataset.prefill;
    });

    $('#national-more').addEventListener('click', () => {
      state.showAllNational = !state.showAllNational;
      renderNational();
    });

    $('#reset-data').addEventListener('click', () => {
      if (!confirm('登録した名所といいねをすべて消去し、初期状態に戻しますか？')) return;
      store.remove(KEY_SPOTS); store.remove(KEY_LIKED);
      spots = seedSpots(); liked = new Set();
      renderAll();
      toast('初期状態に戻しました');
    });

    // モバイルナビ
    const toggle = $('.nav-toggle'), nav = $('#site-nav');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    nav.addEventListener('click', e => {
      if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  initForm();
  bindEvents();
  renderAll();
})();
