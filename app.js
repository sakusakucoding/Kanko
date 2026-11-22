(() => {
  'use strict';

  /* ====== Supabase 接続設定（公開用キー：ブラウザに置いてよい値） ====== */
  const SUPABASE_URL = 'https://gmiwgvjyfberzxugolce.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ez5I5H9SXdKbFMCBEIKCwQ_98nAD8kg';
  const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) : null;
  const photoPublicURL = path => `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;

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
    { id: 'nature',   label: '自然',          icon: '🌲', color: '#2f7d4f', copy: '森・湖・渓谷で深呼吸' },
    { id: 'kids',     label: '子ども・家族',  icon: '🧸', color: '#e08a1e', copy: '動物園・水族館・テーマパーク' },
    { id: 'date',     label: 'デート',        icon: '💕', color: '#d24a74', copy: '夜景と街歩きでふたり旅' },
    { id: 'history',  label: '歴史・文化',    icon: '⛩️', color: '#8a3b2e', copy: 'お城・神社・古い町並み' },
    { id: 'scenic',   label: '絶景',          icon: '🌅', color: '#3b5fa8', copy: '一度は見たいあの景色' },
    { id: 'onsen',    label: '温泉',          icon: '♨️', color: '#b1543a', copy: '名湯でゆったり癒やされる' },
    { id: 'gourmet',  label: 'グルメ',        icon: '🍜', color: '#a0761b', copy: 'ご当地の味を食べ歩き' },
    { id: 'activity', label: 'アクティビティ', icon: '🚣', color: '#18808a', copy: '体を動かして遊びつくす' },
  ];
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

  /* ====== この端末だけの情報（localStorage） ======
     voterId : いいねを「端末ごとに1回」にするためのランダムID
     owned   : 自分が投稿した名所の削除用トークン { spotId: token } */
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');

  let voterId = store.get('kanko.voterId');
  if (!voterId) { voterId = uuid(); store.set('kanko.voterId', voterId); }
  let owned = store.get('kanko.owned') || {};
  const saveOwned = () => store.set('kanko.owned', owned);

  /* ====== データ ====== */
  let spots = [];
  let liked = new Set();
  let online = false;

  const fromRow = r => ({
    id: r.id, pref: r.pref, name: r.name, cats: r.cats || [], desc: r.descr || '', likes: r.likes,
    createdAt: Date.parse(r.created_at) || 0, isSeed: r.is_seed,
    photo: r.photo_path ? photoPublicURL(r.photo_path) : (r.photo_url || ''),
    credit: r.photo_path ? null : r.photo_credit,
  });

  async function loadFromServer() {
    if (!sb) throw new Error('supabase-js not loaded');
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('spots')
        .select('id,pref,name,cats,descr,photo_path,photo_url,photo_credit,likes,is_seed,created_at')
        .range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
    }
    spots = all.map(fromRow);
    const { data: mine, error: e2 } = await sb.rpc('my_likes', { p_voter: voterId });
    if (!e2 && mine) liked = new Set(mine.map(x => (typeof x === 'string' ? x : x.my_likes)));
    online = true;
  }

  // サーバーに繋がらないときは同梱のサンプル（閲覧のみ）
  function loadOfflineSeed() {
    const data = window.SEED_DATA || {}, photos = window.SEED_PHOTOS || {};
    const CODE = { N: 'nature', K: 'kids', D: 'date', H: 'history', S: 'scenic', O: 'onsen', G: 'gourmet', A: 'activity' };
    const hash = s => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);
    spots = [];
    for (const pref of PREFS) {
      const [top, ...items] = data[pref] || [0];
      let likes = top;
      items.forEach(([name, codes, desc], i) => {
        if (i > 0) likes = Math.max(1, likes - (3 + hash(name) % 9));
        const p = photos[`${pref}|${name}`];
        spots.push({ id: `seed-${pref}-${i}`, pref, name, cats: [...codes].map(c => CODE[c]), desc, likes, createdAt: 0, isSeed: true,
          photo: p ? p.src : '', credit: p || null });
      });
    }
    online = false;
  }

  /* ====== 画像の縮小（長辺1600pxのJPEG） ====== */
  function resizeImage(file, max = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        cv.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  async function uploadPhoto(blob) {
    const path = `uploads/${uuid()}.jpg`;
    const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  }

  /* ====== 状態 ====== */
  const state = { category: 'all', region: 1, pref: '東京都', showAllNational: false, modalId: null };

  /* ====== ユーティリティ ====== */
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortPref = p => (p === '北海道' ? p : p.replace(/[都府県]$/, ''));
  const matchCat = s => state.category === 'all' || s.cats.includes(state.category);
  const byScore = (a, b) => b.likes - a.likes || a.createdAt - b.createdAt || a.name.localeCompare(b.name, 'ja');
  const findSpot = id => spots.find(s => s.id === id);
  const isMine = s => !!owned[s.id];

  function ph(s, { shade = false } = {}) {
    const c = CAT[s.cats[0]] || CATEGORIES[0];
    const c2 = CAT[s.cats[1]] || { color: '#00000055' };
    const img = s.photo ? `<img src="${esc(s.photo)}" alt="${esc(s.name)}" loading="lazy" decoding="async" onerror="this.remove()">` : '';
    return `<div class="ph${shade ? ' ph-shade' : ''}" style="--ph-bg: linear-gradient(135deg, ${c.color}, ${c2.color})"><span class="ph-initial" aria-hidden="true">${esc(s.name.charAt(0))}</span>${img}</div>`;
  }

  const heartSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.1 8.4 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5c3.4 0 5.5 3.4 4.1 6.8C19.5 16.4 12 21 12 21z"/></svg>';
  const tags = (s, light = false) => `<div class="tags${light ? ' tags-light' : ''}">${s.cats.map(id => CAT[id] ? `<span class="tag">${CAT[id].icon} ${CAT[id].label}</span>` : '').join('')}</div>`;
  const likeBtn = s => `<button class="like-btn${liked.has(s.id) ? ' liked' : ''}" data-like="${esc(s.id)}" aria-pressed="${liked.has(s.id)}" aria-label="${esc(s.name)}にいいね">${heartSvg}<span>${s.likes}</span></button>`;
  const rankBadge = n => `<span class="rank-badge${n <= 3 ? ' r' + n : ''}">${n}</span>`;
  const mineBadge = s => (isMine(s) ? '<span class="mine-badge">あなたの投稿</span>' : '');

  function spotCard(s, rank, { showPref = false } = {}) {
    return `
      <article class="spot-card" id="spot-${esc(s.id)}">
        <button class="ph-btn" data-open="${esc(s.id)}" aria-label="${esc(s.name)}の詳細を見る">${ph(s)}${rankBadge(rank)}${mineBadge(s)}</button>
        <div class="body">
          ${showPref ? `<span class="pref-badge">${esc(s.pref)} No.1</span>` : ''}
          <h4>${esc(s.name)}</h4>
          ${tags(s)}
          ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
          <div class="card-foot"><span></span>${likeBtn(s)}</div>
        </div>
      </article>`;
  }

  function photoCard(s, rank, label) {
    return `
      <article class="photo-card rank-${rank}">
        <button class="ph-btn cover-btn" data-open="${esc(s.id)}" aria-label="${esc(s.name)}の詳細を見る">${ph(s, { shade: true })}</button>
        ${rankBadge(rank)}${mineBadge(s)}
        <div class="overlay">
          <span class="pref-badge">${esc(label)}</span>
          <h3>${esc(s.name)}</h3>
          ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
          <div class="card-foot">${tags(s, true)}${likeBtn(s)}</div>
        </div>
      </article>`;
  }

  /* ====== ランキング計算 ====== */
  function nationalRanking(filter = true) {
    const tops = [];
    for (const pref of PREFS) {
      const list = spots.filter(s => s.pref === pref && (!filter || matchCat(s))).sort(byScore);
      if (list.length) tops.push(list[0]);
    }
    return tops.sort(byScore);
  }
  const prefTop = pref => spots.filter(s => s.pref === pref).sort(byScore)[0];

  /* ====== カテゴリ ====== */
  function renderChips() {
    const all = [{ id: 'all', label: 'すべて', icon: '🗾' }, ...CATEGORIES];
    $('#category-chips').innerHTML = all.map(c =>
      `<button class="chip" data-cat="${c.id}" aria-pressed="${state.category === c.id}"><span aria-hidden="true">${c.icon}</span>${c.label}</button>`
    ).join('');
  }

  function renderPurpose() {
    $('#purpose-grid').innerHTML = CATEGORIES.map(c => {
      const list = spots.filter(s => s.cats.includes(c.id)).sort(byScore);
      const top = list.find(s => s.photo) || list[0];
      const bg = top ? ph(top, { shade: true }) : `<div class="ph ph-shade" style="--ph-bg:${c.color}"></div>`;
      return `<button class="purpose-card" data-cat="${c.id}" data-scroll="national" aria-pressed="${state.category === c.id}">
        ${bg}<span class="purpose-icon" aria-hidden="true">${c.icon}</span>
        <span class="purpose-text"><strong>${c.label}</strong><small>${c.copy}・${list.length}件</small></span>
      </button>`;
    }).join('');
  }

  /* ====== 全国No.1ランキング ====== */
  function renderNational() {
    const ranked = nationalRanking();
    const cat = CAT[state.category];
    $('#national-filter-note').textContent = cat ? `（「${cat.label}」で絞り込み中：${ranked.length}都道府県）` : '';

    $('#national-podium').innerHTML = ranked.length
      ? ranked.slice(0, 3).map((s, i) => photoCard(s, i + 1, `${s.pref} No.1`)).join('')
      : `<p class="empty">このカテゴリの名所はまだありません。<a href="#register">最初の1件を投稿</a>しませんか？</p>`;

    const rest = ranked.slice(3);
    const LIMIT = 9;
    const shown = state.showAllNational ? rest : rest.slice(0, LIMIT);
    $('#national-list').innerHTML = shown.map((s, i) => spotCard(s, i + 4, { showPref: true })).join('');
    const more = $('#national-more');
    more.hidden = rest.length <= LIMIT;
    more.textContent = state.showAllNational ? '閉じる' : `残り${rest.length - LIMIT}件を表示`;
  }

  /* ====== 都道府県別 ====== */
  function renderRegions() {
    $('#region-tabs').innerHTML = REGIONS.map((r, i) =>
      `<button class="region-tab" role="tab" data-region="${i}" aria-selected="${state.region === i}">${r.name}</button>`
    ).join('');
  }

  function renderPrefGrid() {
    $('#pref-grid').innerHTML = REGIONS[state.region].prefs.map(p => {
      const n = spots.filter(s => s.pref === p && matchCat(s)).length;
      const top = prefTop(p);
      return `<button class="pref-btn" data-pref="${p}" aria-pressed="${state.pref === p}">
        ${top ? ph(top) : '<div class="ph"></div>'}
        <span><strong>${shortPref(p)}</strong><small>${n}件</small></span>
      </button>`;
    }).join('');
  }

  function renderPrefRanking() {
    const list = spots.filter(s => s.pref === state.pref && matchCat(s)).sort(byScore);
    const cat = CAT[state.category];
    const top = list[0] || prefTop(state.pref);
    $('#pref-banner').innerHTML = `
      ${top ? ph(top, { shade: true }) : '<div class="ph ph-shade"></div>'}
      <div class="banner-text">
        <div>
          <h3>${esc(state.pref)}ランキング</h3>
          <p class="banner-sub">${cat ? cat.icon + ' ' + cat.label + '・' : ''}${list.length}件${list[0] ? `｜No.1は「${esc(list[0].name)}」` : ''}</p>
        </div>
        <a href="#register" class="btn btn-glass btn-sm" data-prefill="${esc(state.pref)}">この県の名所を投稿</a>
      </div>`;
    $('#pref-list').innerHTML = list.length
      ? list.map((s, i) => spotCard(s, i + 1)).join('')
      : `<p class="empty">${esc(state.pref)}には${cat ? `「${cat.label}」の` : ''}名所がまだありません。<a href="#register" data-prefill="${esc(state.pref)}">写真と名所を投稿する</a></p>`;
  }

  function renderStats() {
    $('#stat-spots').textContent = spots.length.toLocaleString();
    $('#stat-prefs').innerHTML = `${new Set(spots.map(s => s.pref)).size}<small>/47</small>`;
    $('#stat-likes').textContent = spots.reduce((a, s) => a + s.likes, 0).toLocaleString();
  }

  function renderAll() {
    renderChips(); renderPurpose(); renderNational();
    renderRegions(); renderPrefGrid(); renderPrefRanking(); renderStats();
    if (state.modalId) renderModal();
  }

  /* ====== 詳細モーダル ====== */
  const modal = $('#spot-modal');
  const prefRank = s => spots.filter(x => x.pref === s.pref).sort(byScore).findIndex(x => x.id === s.id) + 1;
  function renderModal() {
    const s = findSpot(state.modalId);
    if (!s) { if (modal.open) modal.close(); return; }
    let credit = '';
    if (s.photo && s.credit) {
      credit = `写真：<a href="https://ja.wikipedia.org/wiki/File:${encodeURIComponent(s.credit.file)}" target="_blank" rel="noopener">Wikimedia Commons</a>（Wikipedia「${esc(s.credit.page)}」より）`;
    } else if (s.photo && !s.isSeed) credit = isMine(s) ? '写真：あなたの投稿' : '写真：ユーザー投稿';
    $('#modal-body').innerHTML = `
      <div class="modal-photo">${ph(s)}<button class="modal-close" data-close aria-label="閉じる">×</button></div>
      <div class="modal-content">
        <span class="pref-badge">${esc(s.pref)}・県内${prefRank(s)}位</span>
        <h3 id="modal-title">${esc(s.name)}</h3>
        ${tags(s)}
        ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
        <div class="modal-meta">${likeBtn(s)}<span class="credit">${credit}</span></div>
        ${isMine(s) && online ? `<div class="modal-actions">
          <button class="btn btn-ghost btn-sm" data-change-photo="${esc(s.id)}">📷 ${s.photo ? '写真を変更' : '写真を追加'}</button>
          <button class="btn btn-ghost btn-sm" data-delete="${esc(s.id)}">この投稿を削除</button>
        </div>` : ''}
      </div>`;
  }
  function openModal(id) {
    state.modalId = id;
    renderModal();
    if (!modal.open) modal.showModal();
  }
  modal.addEventListener('close', () => { state.modalId = null; });
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

  /* ====== 投稿フォーム ====== */
  let pendingPhoto = null;
  let previewURL = null;

  async function setPendingPhoto(file) {
    const err = $('#form-error');
    if (!file) return;
    if (!file.type.startsWith('image/')) { err.textContent = '画像ファイルを選んでください。'; return; }
    if (file.size > 15 * 1024 * 1024) { err.textContent = '写真のサイズは15MBまでです。'; return; }
    try { pendingPhoto = await resizeImage(file); }
    catch { err.textContent = 'この写真は読み込めませんでした（HEIC形式の場合はJPEGに変換してください）。'; return; }
    err.textContent = '';
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(pendingPhoto);
    const img = $('#photo-preview');
    img.src = previewURL; img.hidden = false;
    $('#dropzone').classList.add('has-photo');
    $('#photo-clear').hidden = false;
  }
  function clearPendingPhoto() {
    pendingPhoto = null;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
    $('#photo-preview').hidden = true;
    $('#photo-preview').removeAttribute('src');
    $('#dropzone').classList.remove('has-photo');
    $('#photo-clear').hidden = true;
    $('#f-photo').value = '';
  }

  function serverErrorMessage(e) {
    const m = String((e && (e.message || e.error_description)) || e);
    if (/duplicate|unique/i.test(m)) return 'その名所はこの都道府県にすでに登録されています。いいねで応援しましょう！';
    if (/rate limited/i.test(m)) return '投稿が混み合っています。少し時間をおいてもう一度お試しください。';
    if (/size|too large|exceeded/i.test(m)) return '写真のサイズが大きすぎます。';
    return '送信に失敗しました。通信状況を確認して、もう一度お試しください。';
  }

  function initForm() {
    $('#f-pref').innerHTML = '<option value="">選択してください</option>' +
      REGIONS.map(r => `<optgroup label="${r.name}">${r.prefs.map(p => `<option>${p}</option>`).join('')}</optgroup>`).join('');
    $('#f-cats').innerHTML = CATEGORIES.map(c =>
      `<label><input type="checkbox" name="cats" value="${c.id}"><span>${c.icon} ${c.label}</span></label>`
    ).join('');

    $('#f-photo').addEventListener('change', e => setPendingPhoto(e.target.files[0]));
    $('#photo-clear').addEventListener('click', clearPendingPhoto);
    const dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', e => setPendingPhoto(e.dataTransfer.files[0]));

    $('#register-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const name = f.elements.name.value.trim();
      const pref = f.elements.pref.value;
      const cats = [...f.querySelectorAll('input[name="cats"]:checked')].map(i => i.value);
      const desc = f.elements.desc.value.trim();
      const err = $('#form-error');

      if (!online) { err.textContent = '現在サーバーに接続できないため投稿できません。時間をおいてお試しください。'; return; }
      if (!name) { err.textContent = '名所の名前を入力してください。'; f.elements.name.focus(); return; }
      if (!pref) { err.textContent = '都道府県を選択してください。'; f.elements.pref.focus(); return; }
      if (!cats.length) { err.textContent = 'カテゴリを1つ以上選んでください。'; return; }
      if (spots.some(s => s.pref === pref && s.name === name)) { err.textContent = `「${name}」は${pref}にすでに登録されています。いいねで応援しましょう！`; return; }
      err.textContent = '';

      const btn = $('#submit-btn');
      btn.disabled = true; btn.textContent = pendingPhoto ? '写真をアップロード中…' : '投稿中…';
      let newId;
      try {
        const path = pendingPhoto ? await uploadPhoto(pendingPhoto) : null;
        btn.textContent = '投稿中…';
        const token = randomToken();
        const { data, error } = await sb.rpc('create_spot', {
          p_pref: pref, p_name: name, p_cats: cats, p_descr: desc, p_photo_path: path, p_owner_token: token,
        });
        if (error) throw error;
        newId = data;
        owned[newId] = token; saveOwned();
        spots.push({ id: newId, pref, name, cats, desc, likes: 0, createdAt: Date.now(), isSeed: false,
          photo: path ? photoPublicURL(path) : '', credit: null });
      } catch (ex) {
        err.textContent = serverErrorMessage(ex);
        return;
      } finally {
        btn.disabled = false; btn.textContent = 'この名所を投稿する';
      }
      f.reset();
      clearPendingPhoto();

      state.region = REGIONS.findIndex(r => r.prefs.includes(pref));
      state.pref = pref;
      if (state.category !== 'all' && !cats.includes(state.category)) state.category = 'all';
      renderAll();
      toast(`「${name}」を投稿しました！`);
      requestAnimationFrame(() => {
        const el = document.getElementById('spot-' + newId);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); }
      });
    });
  }

  /* ====== イベント ====== */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const likeBusy = new Set();
  async function toggleLike(s) {
    if (!online) { toast('現在サーバーに接続できないため、いいねできません'); return; }
    if (likeBusy.has(s.id)) return;
    likeBusy.add(s.id);
    // 先に画面を更新（失敗したら戻す）
    const wasLiked = liked.has(s.id), before = s.likes;
    if (wasLiked) { liked.delete(s.id); s.likes = Math.max(0, s.likes - 1); } else { liked.add(s.id); s.likes += 1; }
    renderLikes(s);
    try {
      const { data, error } = await sb.rpc('toggle_like', { p_spot: s.id, p_voter: voterId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        s.likes = row.likes;
        if (row.liked) liked.add(s.id); else liked.delete(s.id);
      }
    } catch {
      s.likes = before;
      if (wasLiked) liked.add(s.id); else liked.delete(s.id);
      toast('いいねを送信できませんでした');
    } finally {
      likeBusy.delete(s.id);
      renderLikes(s);
    }
  }
  function renderLikes(s) {
    renderNational(); renderPrefRanking(); renderStats();
    if (state.modalId) renderModal();
    document.querySelectorAll(`[data-like="${CSS.escape(s.id)}"]`).forEach(b => b.classList.add('pop'));
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      const like = e.target.closest('[data-like]');
      if (like) { const s = findSpot(like.dataset.like); if (s) toggleLike(s); return; }

      const chip = e.target.closest('[data-cat]');
      if (chip) {
        state.category = state.category === chip.dataset.cat && chip.dataset.scroll ? 'all' : chip.dataset.cat;
        state.showAllNational = false;
        renderAll();
        if (chip.dataset.scroll) document.getElementById(chip.dataset.scroll).scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const open = e.target.closest('[data-open]');
      if (open) { openModal(open.dataset.open); return; }
      if (e.target.closest('[data-close]')) { modal.close(); return; }

      const region = e.target.closest('[data-region]');
      if (region) {
        state.region = +region.dataset.region;
        state.pref = REGIONS[state.region].prefs[0];
        renderRegions(); renderPrefGrid(); renderPrefRanking();
        return;
      }
      const pref = e.target.closest('[data-pref]');
      if (pref) { state.pref = pref.dataset.pref; renderPrefGrid(); renderPrefRanking(); return; }

      if (e.target.closest('[data-change-photo]')) { $('#change-photo-input').click(); return; }

      const del = e.target.closest('[data-delete]');
      if (del) { deleteSpot(del.dataset.delete); return; }

      const prefill = e.target.closest('[data-prefill]');
      if (prefill) $('#f-pref').value = prefill.dataset.prefill;
    });

    $('#change-photo-input').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      const s = findSpot(state.modalId);
      if (!file || !s || !isMine(s)) return;
      if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) { toast('15MBまでの画像ファイルを選んでください'); return; }
      toast('写真をアップロード中…');
      try {
        const blob = await resizeImage(file);
        const path = await uploadPhoto(blob);
        const { data, error } = await sb.rpc('set_spot_photo', { p_spot: s.id, p_owner_token: owned[s.id], p_photo_path: path });
        if (error || !data) throw error || new Error('not owner');
        s.photo = photoPublicURL(path); s.credit = null;
        renderAll();
        toast('写真を更新しました');
      } catch (ex) { toast(serverErrorMessage(ex)); }
    });

    $('#national-more').addEventListener('click', () => {
      state.showAllNational = !state.showAllNational;
      renderNational();
    });

    const toggle = $('.nav-toggle'), nav = $('#site-nav');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    nav.addEventListener('click', e => {
      if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  async function deleteSpot(id) {
    const s = findSpot(id);
    if (!s || !isMine(s)) return;
    if (!confirm(`「${s.name}」を削除しますか？`)) return;
    try {
      const { data, error } = await sb.rpc('delete_spot', { p_spot: id, p_owner_token: owned[id] });
      if (error || !data) throw error || new Error('not owner');
    } catch (ex) { toast(serverErrorMessage(ex)); return; }
    spots = spots.filter(x => x.id !== id);
    liked.delete(id);
    delete owned[id]; saveOwned();
    modal.close();
    renderAll();
    toast('削除しました');
  }

  /* ====== お問い合わせ ====== */
  function initContact() {
    const f = $('#contact-form');
    const err = $('#contact-error');
    const btn = $('#contact-btn');
    const msg = f.elements.message;
    const updateCount = () => { $('#c-count').textContent = `${msg.value.length} / 2000`; };
    msg.addEventListener('input', updateCount);

    f.addEventListener('submit', async e => {
      e.preventDefault();
      const name = f.elements.name.value.trim();
      const email = f.elements.email.value.trim();
      const topic = f.elements.topic.value;
      const message = msg.value.trim();

      if (!name) { err.textContent = 'お名前を入力してください。'; f.elements.name.focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'メールアドレスを正しく入力してください。'; f.elements.email.focus(); return; }
      if (!topic) { err.textContent = 'お問い合わせの種類を選択してください。'; f.elements.topic.focus(); return; }
      if (!message) { err.textContent = 'お問い合わせ内容を入力してください。'; msg.focus(); return; }
      if (!f.elements.agree.checked) { err.textContent = '個人情報の取り扱いに同意のうえ送信してください。'; return; }
      err.textContent = '';

      // 人には見えない欄に入力がある＝ボット。送信したふりをして終了
      if (f.elements.website.value) { showDone(); return; }
      if (!sb) { err.textContent = '現在送信できません。時間をおいてお試しください。'; return; }

      btn.disabled = true; btn.textContent = '送信中…';
      try {
        const { error } = await sb.rpc('submit_contact', { p_name: name, p_email: email, p_topic: topic, p_message: message });
        if (error) throw error;
        showDone();
      } catch (ex) {
        const m = String((ex && ex.message) || ex);
        err.textContent = /rate limited/i.test(m)
          ? '送信が混み合っています。少し時間をおいてもう一度お試しください。'
          : '送信に失敗しました。入力内容と通信状況を確認して、もう一度お試しください。';
      } finally {
        btn.disabled = false; btn.textContent = '送信する';
      }
    });

    function showDone() {
      f.reset(); updateCount();
      f.classList.add('sent');
      $('#contact-done').hidden = false;
      $('#contact-done').focus();
    }
    $('#contact-again').addEventListener('click', () => {
      f.classList.remove('sent');
      $('#contact-done').hidden = true;
      f.elements.name.focus();
    });
  }

  /* ====== 起動 ====== */
  initForm();
  initContact();
  bindEvents();
  (async () => {
    $('#stat-spots').textContent = '…';
    try {
      await loadFromServer();
      // 他の端末で削除された自分の投稿はトークンも片付ける
      const ids = new Set(spots.map(s => s.id));
      Object.keys(owned).forEach(k => { if (!ids.has(k)) delete owned[k]; });
      saveOwned();
    } catch (e) {
      console.warn('Supabase に接続できませんでした。サンプル表示に切り替えます。', e);
      loadOfflineSeed();
      toast('サーバーに接続できないため、サンプルを表示しています');
    }
    renderAll();
  })();
})();
