// Douyin Heat Analyzer - Background Service Worker
// Manages data storage and provides utilities for heat score calculation.

const DEFAULT_SETTINGS = {
  autoCollectEnabled: true,
  weights: {
    likes: 3,
    comments: 5,
    shares: 8,
    collects: 6,
    plays: 0.001
  }
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
  const { douyinData } = await chrome.storage.local.get('douyinData');
  if (!douyinData) {
    await chrome.storage.local.set({ douyinData: {} });
  }
});

// Parse count strings like "1.2w", "3.4亿", "12,345", "2k"
function parseCount(input) {
  if (typeof input === 'number') return input;
  if (!input) return 0;
  let s = String(input).trim();
  s = s.replace(/[,\s]/g, '');
  const lower = s.toLowerCase();
  let multiplier = 1;
  if (/亿/.test(s)) multiplier = 1e8;
  else if (/万|w/.test(lower)) multiplier = 1e4;
  else if (/k/.test(lower)) multiplier = 1e3;
  else if (/m/.test(lower)) multiplier = 1e6;
  // Extract leading number (supports decimals)
  const match = s.match(/([0-9]+(?:\.[0-9]+)?)/);
  const num = match ? parseFloat(match[1]) : 0;
  return Math.round(num * multiplier);
}

function parseChineseRelativeTime(s) {
  if (!s) return null;
  s = String(s);
  const now = Date.now();
  const p = (n) => now - n;
  const re = (r) => r.test(s);
  const num = (r) => {
    const m = s.match(r);
    return m ? parseInt(m[1], 10) : null;
  };
  if (re(/刚刚/)) return new Date(now);
  if (re(/(\d+)秒前/)) return new Date(p(num(/(\d+)秒前/)*1000));
  if (re(/(\d+)分钟前/)) return new Date(p(num(/(\d+)分钟前/)*60*1000));
  if (re(/(\d+)小时前/)) return new Date(p(num(/(\d+)小时前/)*60*60*1000));
  if (re(/昨天/)) return new Date(now - 24*60*60*1000);
  if (re(/(\d+)天前/)) return new Date(p(num(/(\d+)天前/)*24*60*60*1000));
  if (re(/(\d+)周前/)) return new Date(p(num(/(\d+)周前/)*7*24*60*60*1000));
  if (re(/(\d+)月前/)) return new Date(p(num(/(\d+)月前/)*30*24*60*60*1000));
  if (re(/(\d+)年前/)) return new Date(p(num(/(\d+)年前/)*365*24*60*60*1000));
  // Try to parse absolute date like 2024-10-05 12:34 or 2024/10/05
  const dt = Date.parse(s.replace(/[./]/g, '-'));
  if (!Number.isNaN(dt)) return new Date(dt);
  return null;
}

function computeHeatScore(item, weights) {
  const w = { ...DEFAULT_SETTINGS.weights, ...(weights||{}) };
  const likes = parseCount(item.likes);
  const comments = parseCount(item.comments);
  const shares = parseCount(item.shares);
  const collects = parseCount(item.collects);
  const plays = parseCount(item.plays);
  const raw = likes*w.likes + comments*w.comments + shares*w.shares + collects*w.collects + plays*w.plays;
  let hours = 24; // default divisor
  if (item.publishTime) {
    const t = typeof item.publishTime === 'string' ? parseChineseRelativeTime(item.publishTime) : new Date(item.publishTime);
    if (t && !Number.isNaN(t.getTime())) {
      const diff = Math.max(0, Date.now() - t.getTime());
      hours = Math.max(1, diff / (60*60*1000));
    }
  }
  const score = raw / Math.cbrt(hours); // cube root to smooth decay
  return Math.round(score * 100) / 100;
}

function mergeVideo(existing, update) {
  const merged = { ...(existing||{}), ...(update||{}) };
  const fields = ['likes','comments','shares','collects','plays'];
  for (const f of fields) {
    const a = parseCount(existing?.[f]);
    const b = parseCount(update?.[f]);
    if (b && b > a) merged[f] = b;
  }
  if (!existing?.publishTime && update?.publishTime) merged.publishTime = update.publishTime;
  if (!existing?.title && update?.title) merged.title = update.title;
  if (!existing?.author && update?.author) merged.author = update.author;
  if (!existing?.duration && update?.duration) merged.duration = update.duration;
  if (!existing?.cover && update?.cover) merged.cover = update.cover;
  if (!existing?.hashtags && update?.hashtags) merged.hashtags = update.hashtags;
  merged.lastUpdated = Date.now();
  return merged;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== 'object') return;
    switch (message.type) {
      case 'getSettings': {
        const { settings } = await chrome.storage.local.get('settings');
        sendResponse({ settings: settings || DEFAULT_SETTINGS });
        break;
      }
      case 'setSettings': {
        const settings = { ...DEFAULT_SETTINGS, ...(message.settings||{}) };
        await chrome.storage.local.set({ settings });
        sendResponse({ ok: true });
        break;
      }
      case 'getAllData': {
        const { douyinData } = await chrome.storage.local.get('douyinData');
        const { settings } = await chrome.storage.local.get('settings');
        const map = douyinData || {};
        const list = Object.values(map).map(item => ({
          ...item,
          heat: computeHeatScore(item, settings?.weights),
        }));
        sendResponse({ list });
        break;
      }
      case 'clearData': {
        await chrome.storage.local.set({ douyinData: {} });
        sendResponse({ ok: true });
        break;
      }
      case 'exportCSV': {
        const { douyinData } = await chrome.storage.local.get('douyinData');
        const list = Object.values(douyinData || {});
        const header = ['videoId','title','author','likes','comments','shares','collects','plays','heat','publishTime','duration','link'];
        const rows = [header.join(',')];
        const { settings } = await chrome.storage.local.get('settings');
        const csvEscape = (v) => {
          if (v === null || v === undefined) return '';
          let s = String(v);
          // escape double quotes
          s = s.replace(/"/g, '""');
          return `"${s}"`;
        };
        for (const it of list) {
          const heat = computeHeatScore(it, settings?.weights);
          const row = [
            csvEscape(it.videoId),
            csvEscape(it.title||''),
            csvEscape(it.author||''),
            parseCount(it.likes)||0,
            parseCount(it.comments)||0,
            parseCount(it.shares)||0,
            parseCount(it.collects)||0,
            parseCount(it.plays)||0,
            heat,
            csvEscape(it.publishTime ? new Date(it.publishTime).toISOString() : ''),
            csvEscape(it.duration||''),
            csvEscape(it.link||'')
          ].join(',');
          rows.push(row);
        }
        const csv = rows.join('\n');
        sendResponse({ csv });
        break;
      }
      case 'addVideoData': {
        const data = message.data || {};
        if (!data.videoId) { sendResponse({ ok:false, error:'Missing videoId' }); break; }
        const { douyinData } = await chrome.storage.local.get('douyinData');
        const map = douyinData || {};
        map[data.videoId] = mergeVideo(map[data.videoId], data);
        await chrome.storage.local.set({ douyinData: map });
        sendResponse({ ok: true });
        break;
      }
      default:
        // no-op
        break;
    }
  })();
  return true; // keep the channel open for async sendResponse
});
