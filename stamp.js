(() => {
  'use strict';
  const { sb, REGIONS, PREFS, regionOf, CAT, CATEGORIES, esc, shortPref, loadSpots, Traveler, markButtons, formatCode } = window.KankoCore;
  const $ = sel => document.querySelector(sel);

  /* ====== 状態 ======
     own   : 自分のスタンプ帳（この端末の旅人ID）
     share : stamp.html?t=公開ID で開いた他人のスタンプ帳（閲覧のみ） */
  const shareId = (new URLSearchParams(location.search).get('t') || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  let mode = 'own';
  let spots = [];
  let byId = new Map();
  let share = null; // { nickname, publicId, marks: Map }
  let lastStamped = new Set();
  let openPref = null;

  const marksMap = () => (mode === 'share' ? share.marks : Traveler.marks);
  const has = (id, kind) => { const m = marksMap().get(id); return !!(m && m[kind]); };
  const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

  function stampedPrefs() {
    const res = new Map();
    marksMap().forEach((m, id) => {
      if (!m.went) return;
      const s = byId.get(id);
      if (!s) return;
      const cur = res.get(s.pref);
      if (!cur) res.set(s.pref, { date: m.went, spot: s, count: 1 });
      else { cur.count++; if (m.went < cur.date) { cur.date = m.went; cur.spot = s; } }
    });
    return res;
  }

  const RANKS = [
    [47, '全国制覇！ 日本マスター'], [30, '列島マスター'], [15, '旅の達人'],
    [5, '週末トラベラー'], [1, '駆け出し旅人'], [0, '旅のはじまり'],
  ];
  const rankOf = n => RANKS.find(([min]) => n >= min)[1];

  function ph(s) {
    const c = CAT[s.cats[0]] || CATEGORIES[0];
    const c2 = CAT[s.cats[1]] || { color: '#00000055' };
    const img = s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : '';
    return `<div class="ph" style="--ph-bg: linear-gradient(135deg, ${c.color}, ${c2.color})"><span class="ph-initial" aria-hidden="true">${esc(s.name.charAt(0))}</span>${img}</div>`;
  }

  /* ====== 進捗 ====== */
  function renderHero() {
    const stamped = stampedPrefs();
    const n = stamped.size;
    $('#stamp-count').textContent = n;
    $('#ring-fg').style.strokeDashoffset = String(326.7 * (1 - n / 47));
    $('#rank-title').textContent = rankOf(n);
    let went = 0, want = 0;
    marksMap().forEach(m => { if (m.went) went++; if (m.want) want++; });
    $('#went-total').textContent = went;
    $('#want-total').textContent = want;
    const doneRegions = REGIONS.filter(r => r.prefs.every(p => stamped.has(p)));
    $('#region-total').textContent = `${doneRegions.length}/6`;
    $('#hero-badges').innerHTML = doneRegions.map(r => `<span class="region-badge" style="--ink-c:${r.ink}">🏅 ${r.name} 制覇</span>`).join('');
    if (mode === 'share') {
      $('#stamp-lead').textContent = `${share.nickname}さんのスタンプ帳です。${n}都道府県を訪問しています。`;
    }
  }

  /* ====== スタンプ帳 ====== */
  const newPrefs = new Set(); // 押したばかりのスタンプ（アニメーション用）
  function renderBook() {
    const stamped = stampedPrefs();
    if (lastStamped.size > 0) {
      stamped.forEach((_, p) => {
        if (!lastStamped.has(p) && !newPrefs.has(p)) { newPrefs.add(p); setTimeout(() => newPrefs.delete(p), 1500); }
      });
    }
    const wantPrefs = new Set();
    marksMap().forEach((m, id) => { if (m.want) { const s = byId.get(id); if (s) wantPrefs.add(s.pref); } });
    $('#regions').innerHTML = REGIONS.map(r => {
      const done = r.prefs.filter(p => stamped.has(p)).length;
      return `<div class="region-block" style="--ink-c:${r.ink}">
        <div class="region-head">
          <h3>${r.name}${done === r.prefs.length ? '<span class="region-complete">制覇！</span>' : ''}</h3>
          <span class="region-count"><span class="done">${done}</span> / ${r.prefs.length}</span>
        </div>
        <div class="stamp-grid">${r.prefs.map((p, i) => {
          const st = stamped.get(p);
          const rot = ((PREFS.indexOf(p) * 37) % 19) - 9; // 県ごとに少しずつ違う傾き
          const isNew = st && newPrefs.has(p);
          const img = st && st.spot.photo ? `;--img:url(&quot;${esc(st.spot.photo)}&quot;)` : '';
          return `<button class="stamp${st ? ' stamped' : ''}${isNew ? ' new' : ''}" data-pref="${p}" style="--rot:${rot}deg${img}" aria-label="${p}${st ? '（スタンプ済み）' : ''}">
            ${!st && wantPrefs.has(p) ? '<span class="stamp-want" title="イキタイあり">⭐</span>' : ''}
            <span class="stamp-face"><span><span class="pn">${shortPref(p)}</span><span class="sub">${st ? fmtDate(st.date) : '未訪問'}</span></span></span>
            <span class="stamp-meta">${st ? esc(st.spot.name) + (st.count > 1 ? ` ほか${st.count - 1}` : '') : ''}</span>
          </button>`;
        }).join('')}</div>
      </div>`;
    }).join('');
    lastStamped = new Set(stamped.keys());
    if (lastStamped.size === 0) lastStamped.add('__init__');
  }

  /* ====== イキタイ リスト ====== */
  function renderWant() {
    const list = [];
    marksMap().forEach((m, id) => { if (m.want) { const s = byId.get(id); if (s) list.push({ s, at: m.want }); } });
    list.sort((a, b) => b.at - a.at);
    if (mode === 'share') $('#want-desc').textContent = `${share.nickname}さんが「イキタイ」を押した観光地です。`;
    $('#want-list').innerHTML = list.length ? list.map(({ s }) => `
      <article class="spot-card">
        <button class="ph-btn" data-open-pref="${s.pref}" aria-label="${esc(s.pref)}の観光地を見る">${ph(s)}${has(s.id, 'went') ? '<span class="mine-badge" style="background:#1f9d6a">イッタ済み</span>' : ''}</button>
        <div class="body">
          <span class="pref-badge">${esc(s.pref)}</span>
          <h4>${esc(s.name)}</h4>
          ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
          <div class="card-foot">${mode === 'own' ? markButtons(s) : ''}</div>
        </div>
      </article>`).join('')
      : `<p class="empty-note">${mode === 'own' ? 'まだイキタイはありません。<a href="index.html#national">観光地を探す</a>から「イキタイ」を押してみましょう。' : 'イキタイはまだありません。'}</p>`;
  }

  /* ====== 旅の記録 ====== */
  function renderTimeline() {
    const items = [];
    marksMap().forEach((m, id) => {
      const s = byId.get(id); if (!s) return;
      if (m.went) items.push({ s, at: m.went, kind: 'went' });
      if (m.want) items.push({ s, at: m.want, kind: 'want' });
    });
    items.sort((a, b) => b.at - a.at);
    $('#timeline').innerHTML = items.length ? items.slice(0, 20).map(({ s, at, kind }) => `
      <li>${ph(s)}<div><strong>${esc(s.name)}</strong><small>${esc(s.pref)}・${fmtDate(at)}</small></div>
      <span class="kind ${kind}">${kind === 'went' ? '✓ イッタ' : '★ イキタイ'}</span></li>`).join('')
      : '<li class="empty-note" style="display:block">まだ記録がありません。</li>';
  }

  /* ====== 旅人ID・引き継ぎ ====== */
  let codeVisible = false;
  function renderTraveler() {
    const box = $('#traveler-card');
    if (mode === 'share') { $('#traveler').hidden = true; return; }
    if (!Traveler.exists) {
      box.innerHTML = `
        <p class="tc-help" style="font-size:14px;color:var(--ink-soft)">まだ旅人IDがありません。観光地の「イキタイ」「イッタ」を押すと自動で作られます。</p>
        <button class="btn btn-primary" data-act="create">今すぐ旅人IDを作る</button>
        <hr class="tc-sep">
        ${restoreForm()}`;
      return;
    }
    const p = Traveler.profile;
    const shareUrl = `${location.origin}${location.pathname}?t=${p.publicId}`;
    box.innerHTML = `
      <div class="tc-row">
        <label for="nick">ニックネーム（共有リンクで表示されます）</label>
        <div class="tc-inline"><input id="nick" maxlength="20" value="${esc(p.nickname)}"><button class="btn btn-ghost btn-sm" data-act="nick">保存</button></div>
      </div>
      <div class="tc-row">
        <span class="tc-label">旅人ID（公開ID）</span>
        <div class="tc-inline" style="align-items:center"><span class="id-chip">${esc(p.publicId)}</span><button class="btn btn-ghost btn-sm" data-act="copy-share" data-url="${esc(shareUrl)}">スタンプ帳の共有リンクをコピー</button></div>
        <p class="tc-help">共有リンクを知っている人は、あなたのスタンプ帳を見ることができます（書き換えはできません）。</p>
      </div>
      <hr class="tc-sep">
      <div class="tc-row">
        <span class="tc-label">引き継ぎコード（秘密）</span>
        <div class="code-box${codeVisible ? '' : ' masked'}" id="code-box">${formatCode(p.secret)}</div>
        <div class="tc-inline">
          <button class="btn btn-ghost btn-sm" data-act="toggle-code">${codeVisible ? '隠す' : '表示する'}</button>
          <button class="btn btn-ghost btn-sm" data-act="copy-code">コピー</button>
        </div>
        <p class="tc-warn">⚠ このコードがあれば、別のスマホやPCで同じスタンプ帳を引き継げます。スクリーンショットやメモで保管し、他人には教えないでください（知られると記録を書き換えられます）。</p>
      </div>
      <hr class="tc-sep">
      ${restoreForm()}
      <hr class="tc-sep">
      <button class="btn-danger" data-act="delete">この旅人IDと記録をすべて削除する</button>`;
  }
  const restoreForm = () => `
    <div class="tc-row">
      <label for="restore">別の端末の記録を引き継ぐ</label>
      <div class="tc-inline"><input id="restore" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn btn-ghost btn-sm" data-act="restore">引き継ぐ</button></div>
      <p class="tc-help">前に使っていた端末の「引き継ぎコード」を入力してください。</p>
    </div>`;

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch { prompt('コピーしてください', text); }
  }

  /* ====== 都道府県ダイアログ ====== */
  const dialog = $('#pref-dialog');
  function renderPrefDialog() {
    if (!openPref) return;
    const list = spots.filter(s => s.pref === openPref).sort((a, b) => b.likes - a.likes);
    const st = stampedPrefs().get(openPref);
    $('#pref-dialog-body').innerHTML = `
      <div class="modal-head">
        <h3 id="pref-dialog-title">${esc(openPref)}</h3>
        <p>${st ? `✓ ${fmtDate(st.date)} スタンプ獲得（イッタ ${st.count}か所）` : (mode === 'own' ? 'どこか1か所に「イッタ」でスタンプGET！' : 'まだ訪問していません')}</p>
        <button class="modal-close" data-close aria-label="閉じる">×</button>
      </div>
      <ul class="pref-spots">${list.map(s => `
        <li>${ph(s)}<div><h4>${esc(s.name)}</h4>${mode === 'own' ? markButtons(s) : `<div class="state-badges">${has(s.id, 'went') ? '<span class="kind went timeline-k">✓ イッタ</span>' : ''}${has(s.id, 'want') ? '<span class="kind want timeline-k">★ イキタイ</span>' : ''}</div>`}</div></li>`).join('')}
      </ul>`;
  }
  function openPrefDialog(pref) {
    openPref = pref;
    renderPrefDialog();
    if (!dialog.open) dialog.showModal();
  }
  dialog.addEventListener('close', () => { openPref = null; });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  /* ====== 共通 ====== */
  function renderAll() {
    renderHero(); renderBook(); renderWant(); renderTimeline(); renderTraveler(); renderPrefDialog();
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  const busy = new Set();
  async function toggleMark(spotId, kind) {
    const s = byId.get(spotId);
    if (!s || busy.has(spotId + kind)) return;
    busy.add(spotId + kind);
    const before = stampedPrefs().size;
    try {
      const r = await Traveler.toggle(spotId, kind);
      s.wantCount = r.want_count; s.wentCount = r.went_count;
      const after = stampedPrefs().size;
      renderAll();
      if (after > before) toast(`🎉 ${s.pref}のスタンプGET！（${after}/47）`);
      else if (kind === 'went' && r.active) toast(`イッタ！ ${s.name}を記録しました`);
      else if (kind === 'want' && r.active) toast(`「${s.name}」をイキタイに追加しました`);
    } catch { toast('記録できませんでした。通信状況を確認してください'); }
    finally { busy.delete(spotId + kind); }
  }

  document.addEventListener('click', async e => {
    const mark = e.target.closest('[data-mark]');
    if (mark && mode === 'own') { toggleMark(mark.dataset.spot, mark.dataset.mark); return; }
    const stamp = e.target.closest('.stamp[data-pref]');
    if (stamp) { openPrefDialog(stamp.dataset.pref); return; }
    const openP = e.target.closest('[data-open-pref]');
    if (openP) { openPrefDialog(openP.dataset.openPref); return; }
    if (e.target.closest('[data-close]')) { dialog.close(); return; }

    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    try {
      if (a === 'create') { await Traveler.ensure(); toast('旅人IDを作成しました'); }
      if (a === 'nick') {
        const v = $('#nick').value.trim();
        if (!v || v.length > 20) { toast('ニックネームは1〜20文字で入力してください'); return; }
        await Traveler.setNickname(v); toast('ニックネームを保存しました');
      }
      if (a === 'copy-share') copy(act.dataset.url, '共有リンクをコピーしました');
      if (a === 'toggle-code') { codeVisible = !codeVisible; renderTraveler(); }
      if (a === 'copy-code') copy(formatCode(Traveler.profile.secret), '引き継ぎコードをコピーしました');
      if (a === 'restore') {
        const code = $('#restore').value;
        if (code.replace(/[^0-9A-Za-z]/g, '').length < 16) { toast('引き継ぎコードを正しく入力してください'); return; }
        if (Traveler.exists && Traveler.marks.size > 0 &&
            !confirm('この端末の今の記録は、引き継ぎ後は表示されなくなります。\n今の引き継ぎコードを控えていない場合、元に戻せません。続けますか？')) return;
        await Traveler.restore(code);
        toast(`引き継ぎました。おかえりなさい、${Traveler.profile.nickname}さん！`);
      }
      if (a === 'delete') {
        if (!confirm('旅人IDと、すべてのイキタイ・イッタの記録を削除します。元に戻せません。よろしいですか？')) return;
        await Traveler.deleteAll(); toast('削除しました');
      }
    } catch (ex) {
      toast(/invalid code/.test(String(ex && ex.message)) ? '引き継ぎコードが見つかりませんでした' : '処理できませんでした。時間をおいてお試しください');
    }
  });

  Traveler.onChange(() => { if (mode === 'own') renderAll(); });

  // モバイルナビ
  const toggle = $('.nav-toggle'), nav = $('#site-nav');
  toggle.addEventListener('click', () => { const o = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', o); });

  /* ====== 起動 ====== */
  (async () => {
    try {
      spots = await loadSpots();
      byId = new Map(spots.map(s => [s.id, s]));
      if (shareId && !(Traveler.exists && Traveler.profile.publicId === shareId)) {
        const { data, error } = await sb.rpc('public_card', { p_public_id: shareId });
        if (error || !data) throw new Error('share not found');
        mode = 'share';
        share = { nickname: data.nickname, publicId: data.public_id, marks: new Map() };
        (data.marks || []).forEach(m => {
          const e = share.marks.get(m.spot_id) || { want: null, went: null };
          e[m.kind] = new Date(m.at); share.marks.set(m.spot_id, e);
        });
        const b = $('#share-banner');
        b.hidden = false;
        b.innerHTML = `📖 ${esc(share.nickname)}さん（${esc(share.publicId)}）のスタンプ帳を見ています<a href="stamp.html">自分のスタンプ帳へ</a>`;
        document.title = `${share.nickname}さんのスタンプ帳｜47都道府県スタンプラリー`;
      } else {
        await Traveler.load();
      }
    } catch (e) {
      console.warn(e);
      if (shareId) toast('このスタンプ帳は見つかりませんでした');
      else toast('サーバーに接続できませんでした');
    }
    renderAll();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  })();
})();
