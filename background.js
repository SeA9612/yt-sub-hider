import { loadData, toHideState } from './storage.js';

// 아이콘을 누르면 설정창을 연다
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// 콘텐츠 스크립트는 session 저장소에 직접 접근할 수 없으므로 여기서 대신 읽어 준다
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'getState') {
    loadData().then((d) => sendResponse(toHideState(d)));
    return true;
  }
});

// 설정이 바뀌면 열려 있는 유튜브 탭에 바로 반영
chrome.storage.onChanged.addListener(async (changes) => {
  if (!changes.data && !changes.autoClear) return;
  const state = toHideState(await loadData());
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  for (const t of tabs) {
    chrome.tabs.sendMessage(t.id, { type: 'state', state }).catch(() => {});
  }
});
