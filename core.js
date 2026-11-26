/* =====================================================================
 * 共通コード：Supabase接続・マスターデータ・旅人ID（イキタイ/イッタ）
 * index.html（ランキング）と stamp.html（スタンプラリー）の両方で使う
 * ===================================================================== */
(() => {
  'use strict';

  /* ====== Supabase 接続設定（公開用キー：ブラウザに置いてよい値） ====== */
  const SUPABASE_URL = 'https://gmiwgvjyfberzxugolce.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ez5I5H9SXdKbFMCBEIKCwQ_98nAD8kg';
  const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } }) : null;
  const photoPublicURL = path => `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;

  /* ====== マスターデータ ====== */
  const REGIONS = [
    { name: '北海道・東北', ink: '#2f6fb5', prefs: ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
    { name: '関東', ink: '#7a4bb0', prefs: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
    { name: '中部', ink: '#2f8a5b', prefs: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
    { name: '近畿', ink: '#c0563b', prefs: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
    { name: '中国・四国', ink: '#b07a12', prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県'] },
    { name: '九州・沖縄', ink: '#1d8a95', prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
  ];
  const PREFS = REGIONS.flatMap(r => r.prefs);
  const regionOf = pref => REGIONS.find(r => r.prefs.includes(pref));

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

  /* ====== 小物 ====== */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortPref = p => (p === '北海道' ? p : p.replace(/[都府県]$/, ''));
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
    remove(key) { try { localStorage.removeItem(key); } catch {} },
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

  const SPOT_COLUMNS = 'id,pref,name,cats,descr,photo_path,photo_url,photo_credit,likes,want_count,went_count,is_seed,created_at';
  const fromRow = r => ({
    id: r.id, pref: r.pref, name: r.name, cats: r.cats || [], desc: r.descr || '', likes: r.likes,
    wantCount: r.want_count || 0, wentCount: r.went_count || 0,
    createdAt: Date.parse(r.created_at) || 0, isSeed: r.is_seed,
    photo: r.photo_path ? photoPublicURL(r.photo_path) : (r.photo_url || ''),
    credit: r.photo_path ? null : r.photo_credit,
  });
  async function loadSpots() {
    if (!sb) throw new Error('supabase-js not loaded');
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('spots').select(SPOT_COLUMNS).range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
    }
    return all.map(fromRow);
  }

  /* =====================================================================
   * 旅人ID（人ごとのスタンプ帳）
   *  - 公開ID：8文字（例 7K3Q9MXA）。共有リンク stamp.html?t=公開ID で、読み取り専用で見せられる
   *  - 引き継ぎコード：20文字（例 ABCD-EFGH-JKLM-NPQR-STUV）。この端末だけが持つ秘密の鍵。
   *    サーバーにはハッシュだけ保存。別の端末に入力すると同じスタンプ帳を引き継げる
   *  - 初めてイキタイ/イッタを押したときに自動で作成（会員登録なし）
   * ===================================================================== */
  const KEY_TRAVELER = 'kanko.traveler.v1';
  const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 0/O, 1/I/L など紛らわしい文字は除外
  const newSecret = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return [...bytes].map(b => CODE_ALPHABET[b % 32]).join('');
  };
  const normalizeCode = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const formatCode = c => normalizeCode(c).replace(/(.{4})(?=.)/g, '$1-');

  const listeners = new Set();
  const Traveler = {
    profile: store.get(KEY_TRAVELER), // { secret, publicId, nickname, createdAt }
    marks: new Map(),                 // spotId -> { want: Date|null, went: Date|null }
    loaded: false,

    get exists() { return !!(this.profile && this.profile.secret); },
    has(spotId, kind) { const m = this.marks.get(spotId); return !!(m && m[kind]); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },

    applyCard(card, secret) {
      this.profile = { secret: normalizeCode(secret), publicId: card.public_id, nickname: card.nickname, createdAt: card.created_at };
      store.set(KEY_TRAVELER, this.profile);
      this.marks = new Map();
      (card.marks || []).forEach(m => {
        const e = this.marks.get(m.spot_id) || { want: null, went: null };
        e[m.kind] = new Date(m.at);
        this.marks.set(m.spot_id, e);
      });
      this.loaded = true;
      this.emit();
    },

    async load() {
      if (!this.exists || !sb) { this.loaded = true; return; }
      const { data, error } = await sb.rpc('my_card', { p_secret: this.profile.secret });
      if (error) {
        // サーバー側で削除済みなど：この端末の情報を消して新規扱いに
        if (/invalid code/.test(error.message)) { store.remove(KEY_TRAVELER); this.profile = null; this.marks = new Map(); this.loaded = true; this.emit(); return; }
        throw error;
      }
      this.applyCard(data, this.profile.secret);
    },

    async ensure() {
      if (this.exists) return;
      const secret = newSecret();
      const { data, error } = await sb.rpc('register_traveler', { p_secret: secret, p_nickname: null });
      if (error) throw error;
      this.applyCard(data, secret);
    },

    async toggle(spotId, kind) {
      await this.ensure();
      const { data, error } = await sb.rpc('toggle_mark', { p_secret: this.profile.secret, p_spot: spotId, p_kind: kind });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const e = this.marks.get(spotId) || { want: null, went: null };
      e[kind] = row.active ? new Date() : null;
      this.marks.set(spotId, e);
      this.emit();
      return row; // { active, want_count, went_count }
    },

    async restore(code) {
      const secret = normalizeCode(code);
      const { data, error } = await sb.rpc('my_card', { p_secret: secret });
      if (error) throw error;
      if (!data) throw new Error('invalid code');
      this.applyCard(data, secret);
    },

    async setNickname(name) {
      await this.ensure();
      const { data, error } = await sb.rpc('set_nickname', { p_secret: this.profile.secret, p_nickname: name });
      if (error) throw error;
      this.applyCard(data, this.profile.secret);
    },

    async deleteAll() {
      if (!this.exists) return;
      const { error } = await sb.rpc('delete_traveler', { p_secret: this.profile.secret });
      if (error && !/invalid code/.test(error.message)) throw error;
      store.remove(KEY_TRAVELER);
      this.profile = null; this.marks = new Map();
      this.emit();
    },

    // 訪問済み都道府県 → 最初にイッタした日
    stampedPrefs(spotsById) {
      const res = new Map();
      this.marks.forEach((m, id) => {
        if (!m.went) return;
        const s = spotsById.get(id);
        if (!s) return;
        const cur = res.get(s.pref);
        if (!cur || m.went < cur.date) res.set(s.pref, { date: m.went, spot: s });
      });
      return res;
    },
  };

  /* ====== イキタイ / イッタ ボタン ====== */
  const ICON_WANT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>';
  const ICON_WENT = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.7 2.7L16.2 9.5"/></svg>';
  function markButtons(s, { size = '' } = {}) {
    const want = Traveler.has(s.id, 'want'), went = Traveler.has(s.id, 'went');
    return `<div class="mark-btns ${size}">
      <button class="mark-btn want${want ? ' on' : ''}" data-mark="want" data-spot="${esc(s.id)}" aria-pressed="${want}" aria-label="${esc(s.name)}にイキタイ">${ICON_WANT}<span>イキタイ</span><b>${s.wantCount}</b></button>
      <button class="mark-btn went${went ? ' on' : ''}" data-mark="went" data-spot="${esc(s.id)}" aria-pressed="${went}" aria-label="${esc(s.name)}にイッタ">${ICON_WENT}<span>イッタ</span><b>${s.wentCount}</b></button>
    </div>`;
  }

  window.KankoCore = {
    sb, SUPABASE_URL, photoPublicURL,
    REGIONS, PREFS, regionOf, CATEGORIES, CAT,
    esc, shortPref, store, uuid,
    loadSpots, fromRow,
    Traveler, formatCode, normalizeCode, markButtons,
  };
})();
