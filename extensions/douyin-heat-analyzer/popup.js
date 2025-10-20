// Douyin Heat Analyzer - Popup UI

function el(id){ return document.getElementById(id); }

function renderTable(list){
  const tbody = document.querySelector('#table tbody');
  tbody.innerHTML = '';
  const sorted = [...list].sort((a,b) => (b.heat||0) - (a.heat||0));
  for (const it of sorted){
    const tr = document.createElement('tr');
    const cover = it.cover ? `<img src="${it.cover}"/>` : '';
    const title = (it.title||'').slice(0,100);
    tr.innerHTML = `
      <td>${cover}</td>
      <td title="${it.title||''}">${title}</td>
      <td>${it.author||''}</td>
      <td>${it.likes||0}</td>
      <td>${it.comments||0}</td>
      <td>${it.shares||0}</td>
      <td>${it.collects||0}</td>
      <td>${it.plays||0}</td>
      <td><b>${it.heat||0}</b></td>
      <td>${it.publishTime ? new Date(it.publishTime).toLocaleString() : ''}</td>
      <td><a href="${it.link}" target="_blank" rel="noreferrer">打开</a></td>
    `;
    tbody.appendChild(tr);
  }

  // stats
  el('total-videos').textContent = String(list.length);
  const heats = list.map(x => x.heat||0);
  const avg = heats.length ? (heats.reduce((a,b)=>a+b,0)/heats.length) : 0;
  el('avg-heat').textContent = String(Math.round(avg*100)/100);
  el('top-heat').textContent = String(Math.max(0, ...heats));
}

async function refresh(){
  const { list } = await chrome.runtime.sendMessage({ type: 'getAllData' });
  renderTable(list || []);
}

async function init(){
  const { settings } = await chrome.runtime.sendMessage({ type: 'getSettings' });
  const on = settings?.autoCollectEnabled !== false;
  el('toggle-auto').checked = on;
  el('toggle-auto').addEventListener('change', async (e) => {
    const settings2 = { ...settings, autoCollectEnabled: !!e.target.checked };
    await chrome.runtime.sendMessage({ type: 'setSettings', settings: settings2 });
  });

  el('btn-clear').addEventListener('click', async () => {
    if (!confirm('确认清空所有已收集数据？')) return;
    await chrome.runtime.sendMessage({ type: 'clearData' });
    await refresh();
  });

  el('btn-export').addEventListener('click', async () => {
    const { csv } = await chrome.runtime.sendMessage({ type: 'exportCSV' });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'douyin-heat.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  el('btn-scan').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'scanNow' });
    }
  });

  await refresh();
}

document.addEventListener('DOMContentLoaded', init);
