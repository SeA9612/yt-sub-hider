(() => {
  'use strict';

  // ───────── 숨길 "카드" 단위 ─────────
  // 유튜브가 화면 구조를 바꾸면 이 목록만 고치면 된다.
  const CARD_SELECTORS = [
    'ytd-rich-item-renderer',          // 홈 / 구독 피드 그리드
    'yt-lockup-view-model',            // 새 형식의 영상 카드
    'ytd-video-renderer',              // 검색 결과
    'ytd-compact-video-renderer',      // 시청 화면 오른쪽 추천
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-radio-renderer',
    'ytd-reel-item-renderer',          // Shorts
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-channel-renderer',            // 검색 결과의 채널
    'ytd-grid-channel-renderer',
    'ytd-guide-entry-renderer',        // 왼쪽 사이드바 구독 목록
    'ytd-post-renderer',               // 커뮤니티 게시물
    'ytd-backstage-post-thread-renderer',
    'ytd-notification-renderer',       // 알림
  ];
  const CARD = CARD_SELECTORS.join(',');
  const NAME_SEL = 'a, span, yt-formatted-string';
  const ATTR = 'data-sub-hider';

  let titleSet = new Set();
  let keywords = [];

  // ───────── 1) CSS :has() 로 링크 기반 숨김 (깜빡임 없음) ─────────
  const style = document.createElement('style');
  style.id = 'sub-hider-style';
  const BASE_CSS = `[${ATTR}]{display:none!important}`;
  style.textContent = BASE_CSS;
  (document.head || document.documentElement).appendChild(style);

  const cssStr = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '') + '"';
  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function linkSelectors(ch) {
    const out = [];
    if (ch.id) out.push(`[href*=${cssStr('/channel/' + ch.id)}]`);
    if (ch.handle) {
      const raw = ch.handle.replace(/^\/?@/, '');
      const decoded = safeDecode(raw);
      for (const v of new Set([raw, decoded, encodeURIComponent(decoded)])) {
        if (!v) continue;
        out.push(`[href$=${cssStr('/@' + v)} i]`);
        out.push(`[href*=${cssStr('/@' + v + '/')} i]`);
        out.push(`[href*=${cssStr('/@' + v + '?')} i]`);
      }
    }
    return out;
  }

  function buildCss(blocked) {
    const links = blocked.flatMap(linkSelectors);
    if (!links.length) return BASE_CSS;
    return `${BASE_CSS}\n:is(${CARD}):has(a:is(${links.join(',')})){display:none!important}`;
  }

  // ───────── 2) JS 스캔: 채널 이름 / 키워드 기반 숨김 ─────────
  // 링크가 없는 카드(예: 시청 화면 추천의 일부)는 채널 이름 글자로 찾는다.
  function shouldHide(card) {
    if (titleSet.size) {
      for (const el of card.querySelectorAll(NAME_SEL)) {
        if (titleSet.has(norm(el.textContent))) return true;
      }
    }
    if (keywords.length) {
      const text = (card.textContent || '').toLowerCase();
      for (const k of keywords) if (text.includes(k)) return true;
    }
    return false;
  }

  function scan() {
    const active = titleSet.size || keywords.length;
    for (const card of document.querySelectorAll(CARD)) {
      // 유튜브는 카드 요소를 재활용하므로 매번 다시 판정해서 붙였다 뗐다 한다
      if (active && shouldHide(card)) {
        if (!card.hasAttribute(ATTR)) card.setAttribute(ATTR, '');
      } else if (card.hasAttribute(ATTR)) {
        card.removeAttribute(ATTR);
      }
    }
  }

  let timer = 0;
  let lastRun = 0;
  function scheduleScan() {
    if (timer) return;
    const wait = Math.max(0, 250 - (Date.now() - lastRun));
    timer = setTimeout(() => { timer = 0; lastRun = Date.now(); scan(); }, wait);
  }

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
  });

  function applyState(state) {
    const blocked = state?.blocked || [];
    style.textContent = buildCss(blocked);
    titleSet = new Set(blocked.map((b) => norm(b.title)).filter((t) => t.length > 1));
    keywords = (state?.keywords || []).map(norm).filter(Boolean);
    scan();
  }

  // ───────── 3) 구독 목록 가져오기 (로그인된 유튜브 세션 사용, API 키 불필요) ─────────
  function extractObject(text, start) {
    const i = text.indexOf('{', start);
    if (i < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
      }
    }
    return null;
  }

  function extractInitialData(html) {
    for (const marker of ['var ytInitialData =', 'window["ytInitialData"] =', 'ytInitialData =']) {
      const at = html.indexOf(marker);
      if (at >= 0) {
        const obj = extractObject(html, at + marker.length);
        if (obj) return obj;
      }
    }
    return null;
  }

  function extractYtcfg(html) {
    const cfg = {};
    let at = 0;
    while ((at = html.indexOf('ytcfg.set({', at)) >= 0) {
      const obj = extractObject(html, at + 'ytcfg.set('.length);
      if (obj) Object.assign(cfg, obj);
      at += 10;
    }
    return cfg;
  }

  const textOf = (t) => t?.simpleText ?? (t?.runs || []).map((r) => r.text).join('');

  function walk(node, fn) {
    if (!node || typeof node !== 'object') return;
    fn(node);
    for (const k in node) walk(node[k], fn);
  }

  function collectChannels(root, map) {
    walk(root, (n) => {
      const r = n.channelRenderer || n.gridChannelRenderer;
      if (!r?.channelId || map.has(r.channelId)) return;
      const base = r.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || '';
      let handle = base.startsWith('/@') ? base.slice(1) : '';
      if (!handle) {
        const sub = textOf(r.subscriberCountText);
        if (sub.startsWith('@')) handle = sub;
      }
      const thumbs = r.thumbnail?.thumbnails || [];
      let thumb = thumbs[thumbs.length - 1]?.url || '';
      if (thumb.startsWith('//')) thumb = 'https:' + thumb;
      map.set(r.channelId, {
        id: r.channelId,
        title: textOf(r.title) || handle || r.channelId,
        handle: safeDecode(handle),
        thumb,
      });
    });
  }

  function findContinuation(root) {
    let token = null;
    walk(root, (n) => {
      if (!token && n.continuationCommand?.token) token = n.continuationCommand.token;
    });
    return token;
  }

  function getCookie(name) {
    for (const part of document.cookie.split(/;\s*/)) {
      const eq = part.indexOf('=');
      if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
    }
    return '';
  }

  async function sha1Hex(s) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // 로그인된 사용자로 유튜브 내부 API를 부르기 위한 인증 헤더 (유튜브 웹이 쓰는 방식과 동일)
  async function authHeader() {
    const ts = Math.floor(Date.now() / 1000);
    const origin = location.origin;
    const pairs = [
      ['SAPISIDHASH', getCookie('SAPISID') || getCookie('__Secure-3PAPISID')],
      ['SAPISID1PHASH', getCookie('__Secure-1PAPISID')],
      ['SAPISID3PHASH', getCookie('__Secure-3PAPISID')],
    ];
    const parts = [];
    for (const [label, val] of pairs) {
      if (val) parts.push(`${label} ${ts}_${await sha1Hex(`${ts} ${val} ${origin}`)}`);
    }
    return parts.join(' ');
  }

  async function innertube(endpoint, body, cfg) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': location.origin,
      'X-Goog-AuthUser': String(cfg.SESSION_INDEX ?? 0),
      'X-Youtube-Client-Name': String(cfg.INNERTUBE_CONTEXT_CLIENT_NAME ?? 1),
      'X-Youtube-Client-Version': String(cfg.INNERTUBE_CLIENT_VERSION ?? cfg.INNERTUBE_CONTEXT?.client?.clientVersion ?? ''),
    };
    if (cfg.DELEGATED_SESSION_ID) headers['X-Goog-PageId'] = cfg.DELEGATED_SESSION_ID;
    const auth = await authHeader();
    if (auth) headers.Authorization = auth;
    const res = await fetch(`${location.origin}/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ context: cfg.INNERTUBE_CONTEXT, ...body }),
    });
    if (!res.ok) throw new Error(`유튜브 응답 오류 (${endpoint}, HTTP ${res.status})`);
    return res.json();
  }

  // 왼쪽 사이드바(가이드)의 "구독" 섹션에서 채널 읽기 — 구독 페이지 형식이 바뀌었을 때의 대안
  function collectFromGuide(root, map) {
    walk(root, (n) => {
      if (!n.guideSubscriptionsSectionRenderer) return;
      walk(n.guideSubscriptionsSectionRenderer, (m) => {
        const e = m.guideEntryRenderer;
        const be = e?.navigationEndpoint?.browseEndpoint;
        const id = be?.browseId;
        if (!id || !/^UC[\w-]{22}$/.test(id) || map.has(id)) return;
        const base = be.canonicalBaseUrl || '';
        const thumbs = e.thumbnail?.thumbnails || [];
        let thumb = thumbs[thumbs.length - 1]?.url || '';
        if (thumb.startsWith('//')) thumb = 'https:' + thumb;
        const handle = base.startsWith('/@') ? safeDecode(base.slice(1)) : '';
        map.set(id, {
          id,
          title: textOf(e.formattedTitle) || e.accessibility?.accessibilityData?.label || handle || id,
          handle,
          thumb,
        });
      });
    });
  }

  // 진단용: 응답에 들어 있는 화면 부품 이름만 모은다 (채널 이름 등 내용은 담지 않음)
  function structureSummary(root) {
    const counts = new Map();
    walk(root, (n) => {
      for (const k of Object.keys(n)) {
        if (/(Renderer|ViewModel)$/.test(k)) counts.set(k, (counts.get(k) || 0) + 1);
      }
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([k, v]) => `${k}×${v}`).join(', ');
  }

  async function fetchSubscriptions() {
    const res = await fetch(`${location.origin}/feed/channels`, { credentials: 'include' });
    if (!res.ok) throw new Error(`구독 페이지를 열지 못했습니다 (HTTP ${res.status})`);
    const html = await res.text();
    const cfg = extractYtcfg(html);
    if (cfg.LOGGED_IN === false) throw new Error('유튜브에 로그인되어 있지 않습니다. 먼저 로그인해 주세요.');
    const data = extractInitialData(html);

    const map = new Map();
    let partial = false;
    const diag = [];

    // 방법 1) 구독 채널 페이지 (/feed/channels)
    if (data) {
      collectChannels(data, map);
      let token = findContinuation(data);
      for (let guard = 0; token && guard < 200; guard++) {
        try {
          const page = await innertube('browse', { continuation: token }, cfg);
          const before = map.size;
          collectChannels(page, map);
          token = findContinuation(page);
          if (map.size === before) break;
        } catch (e) {
          partial = true;
          console.warn('[구독 가리개]', e);
          break;
        }
      }
      if (!map.size) diag.push(`구독 페이지: ${structureSummary(data) || '내용 없음'}`);
    } else {
      diag.push('구독 페이지: ytInitialData 없음');
    }

    // 방법 2) 사이드바 구독 목록 (/youtubei/v1/guide)
    if (!map.size) {
      try {
        const guide = await innertube('guide', {}, cfg);
        collectFromGuide(guide, map);
        partial = false;
        if (!map.size) diag.push(`사이드바: ${structureSummary(guide) || '내용 없음'}`);
      } catch (e) {
        diag.push(`사이드바: ${e.message}`);
      }
    }

    if (!map.size) {
      const who = cfg.LOGGED_IN === true ? '로그인 확인됨' : `로그인 상태 불명(${cfg.LOGGED_IN})`;
      throw new Error(`구독 채널을 찾지 못했습니다. [진단] ${who} / ${diag.join(' / ')}`);
    }
    return { subs: [...map.values()], partial };
  }

  // ───────── 메시지 ─────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'ping') { sendResponse(true); return; }
    if (msg?.type === 'state') { applyState(msg.state); return; }
    if (msg?.type === 'fetchSubs') {
      fetchSubscriptions()
        .then((r) => sendResponse({ ok: true, ...r }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
  });

  chrome.runtime.sendMessage({ type: 'getState' }).then(applyState).catch(() => {});
})();
