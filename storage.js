// 저장 위치
// - autoClear 켜짐(기본): chrome.storage.session → 메모리에만 저장, 크롬을 닫으면 사라짐
// - autoClear 꺼짐: chrome.storage.local → 확장 프로그램을 삭제할 때까지 이 PC에만 저장
// 어떤 경우에도 chrome.storage.sync(구글 계정 동기화)는 쓰지 않는다.

const FLAG_KEY = 'autoClear';
const DATA_KEY = 'data';

export const EMPTY = Object.freeze({ subs: [], subsFetchedAt: 0, blocked: {}, keywords: [] });

export async function getAutoClear() {
  const r = await chrome.storage.local.get(FLAG_KEY);
  return r[FLAG_KEY] !== false; // 기본값: 켜짐
}

function area(autoClear) {
  return autoClear ? chrome.storage.session : chrome.storage.local;
}

export async function loadData() {
  const r = await area(await getAutoClear()).get(DATA_KEY);
  return { ...structuredClone(EMPTY), ...(r[DATA_KEY] || {}) };
}

export async function saveData(data) {
  await area(await getAutoClear()).set({ [DATA_KEY]: data });
}

export async function setAutoClear(on) {
  const data = await loadData();
  await area(on).set({ [DATA_KEY]: data });
  await chrome.storage.local.set({ [FLAG_KEY]: on });
  await area(!on).remove(DATA_KEY);
}

export async function clearAll() {
  await chrome.storage.session.remove(DATA_KEY);
  await chrome.storage.local.remove(DATA_KEY);
}

// 콘텐츠 스크립트에 넘길 최소 정보
export function toHideState(data) {
  return { blocked: Object.values(data.blocked), keywords: data.keywords };
}
