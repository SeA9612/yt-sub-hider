import { loadData, saveData, getAutoClear, setAutoClear, clearAll } from './storage.js';

const $ = (s) => document.querySelector(s);
let data;

// ───────── 상태 표시 ─────────
function setStatus(msg, kind = 'info') {
  const el = $('#status');
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `status ${kind}`;
  el.textContent = msg;
}

// ───────── 렌더링 ─────────
function allChannels() {
  // 구독 목록 + (구독 목록에 없지만 차단돼 있는 채널)
  const seen = new Set(data.subs.map((s) => s.id));
  const extra = Object.values(data.blocked).filter((b) => !seen.has(b.id));
  return [...data.subs, ...extra];
}

function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const list = $('#list');
  list.replaceChildren();
  const channels = allChannels();
  const shown = q
    ? channels.filter((c) => c.title.toLowerCase().includes(q) || (c.handle || '').toLowerCase().includes(q))
    : channels;

  for (const ch of shown) {
    const isBlocked = !!data.blocked[ch.id];
    const li = document.createElement('li');
    li.className = 'item' + (isBlocked ? ' off' : '');

    let avatar;
    if (ch.thumb) {
      avatar = document.createElement('img');
      avatar.src = ch.thumb;
      avatar.alt = '';
      avatar.loading = 'lazy';
      avatar.referrerPolicy = 'no-referrer';
    } else {
      avatar = document.createElement('div');
      avatar.className = 'ph';
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = ch.title;
    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.textContent = ch.handle || '';
    meta.append(name, handle);

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = isBlocked ? '숨김' : '보임';

    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.className = 'switch';
    sw.checked = !isBlocked;
    sw.title = isBlocked ? '숨김 — 눌러서 다시 보이기' : '보임 — 눌러서 숨기기';
    sw.addEventListener('change', () => toggle(ch, !sw.checked));

    li.append(avatar, meta, tag, sw);
    list.append(li);
  }

  const total = channels.length;
  const hidden = Object.keys(data.blocked).length;
  $('#count').textContent = total ? `${total}개 중 ${hidden}개 숨김` : '';
  $('#empty').hidden = total > 0;
  $('#blockAll').disabled = !data.subs.length;
  $('#unblockAll').disabled = !hidden;
}

function renderKeywords() {
  const box = $('#kwList');
  box.replaceChildren();
  for (const kw of data.keywords) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(kw);
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = '삭제';
    x.addEventListener('click', async () => {
      data.keywords = data.keywords.filter((k) => k !== kw);
      await saveData(data);
      renderKeywords();
    });
    chip.append(x);
    box.append(chip);
  }
}

function render() { renderList(); renderKeywords(); }

// ───────── 동작 ─────────
const pick = (c) => ({ id: c.id, title: c.title, handle: c.handle || '' });

async function toggle(ch, block) {
  if (block) data.blocked[ch.id] = pick(ch);
  else delete data.blocked[ch.id];
  await saveData(data);
  renderList();
}

async function blockAll() {
  if (!confirm(`구독 채널 ${data.subs.length}개를 모두 숨길까요?`)) return;
  for (const s of data.subs) data.blocked[s.id] = pick(s);
  await saveData(data);
  renderList();
}

async function unblockAll() {
  data.blocked = {};
  await saveData(data);
  renderList();
}

// ───────── 구독 목록 가져오기 ─────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function trySend(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); } catch { return undefined; }
}

async function callFetch(tabId) {
  const r = await trySend(tabId, { type: 'fetchSubs' });
  if (!r?.ok) throw new Error(r?.error || '구독 목록을 불러오지 못했습니다.');
  return r;
}

async function requestSubs() {
  // 1) 이미 열려 있는 유튜브 탭 사용
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  for (const t of tabs) {
    if (await trySend(t.id, { type: 'ping' })) return callFetch(t.id);
  }
  // 2) 없으면 백그라운드 탭을 잠깐 열었다가 닫는다
  const tab = await chrome.tabs.create({ url: 'https://www.youtube.com/', active: false });
  try {
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (await trySend(tab.id, { type: 'ping' })) return await callFetch(tab.id);
    }
    throw new Error('유튜브 페이지를 열지 못했습니다. 인터넷 연결을 확인해 주세요.');
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function refreshSubs() {
  const btn = $('#refresh');
  btn.disabled = true;
  setStatus('구독 목록을 불러오는 중…');
  try {
    const { subs, partial } = await requestSubs();
    if (!subs.length) throw new Error('구독 채널을 찾지 못했습니다. 유튜브에 로그인되어 있는지 확인해 주세요.');
    subs.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    data.subs = subs;
    data.subsFetchedAt = Date.now();
    for (const s of subs) if (data.blocked[s.id]) data.blocked[s.id] = pick(s);
    await saveData(data);
    setStatus(
      partial
        ? `구독 채널 ${subs.length}개를 불러왔습니다. (일부만 불러왔을 수 있습니다 — 다시 시도해 보세요)`
        : `구독 채널 ${subs.length}개를 불러왔습니다.`,
      partial ? 'error' : 'ok',
    );
    render();
  } catch (e) {
    setStatus(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ───────── 초기화 ─────────
async function init() {
  data = await loadData();
  $('#autoClear').checked = await getAutoClear();
  render();

  $('#search').addEventListener('input', renderList);
  $('#refresh').addEventListener('click', refreshSubs);
  $('#blockAll').addEventListener('click', blockAll);
  $('#unblockAll').addEventListener('click', unblockAll);

  $('#kwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#kwInput');
    const kw = input.value.trim();
    if (kw && !data.keywords.some((k) => k.toLowerCase() === kw.toLowerCase())) {
      data.keywords.push(kw);
      await saveData(data);
      renderKeywords();
    }
    input.value = '';
  });

  $('#autoClear').addEventListener('change', async (e) => {
    await setAutoClear(e.target.checked);
    setStatus(e.target.checked
      ? '크롬을 닫으면 목록이 자동으로 삭제됩니다.'
      : '확장 프로그램을 삭제할 때까지 이 PC에 목록이 남습니다.', 'ok');
  });

  $('#wipe').addEventListener('click', async () => {
    if (!confirm('구독 목록·차단 목록·키워드를 모두 지울까요?')) return;
    await clearAll();
    data = await loadData();
    render();
    setStatus('모두 지웠습니다.', 'ok');
  });

  // 처음 열었을 때 구독 목록이 비어 있으면 자동으로 불러온다
  if (!data.subs.length) refreshSubs();
}

init();
