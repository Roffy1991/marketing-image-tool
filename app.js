// 工作流返回字段 → size id 的映射
const WORKFLOW_KEY_MAP = {
  kaiping:        'splash',
  jainglizhognxin: 'reward',
  tanchuang:      'popup',
  zuche:          'profile',
  xiaochengxu:    'miniapp',
  youdian:        'banner-oil',
  xinzeng:        'banner-new',
};

// ===== 尺寸配置 =====
const SIZES = [
  { id: 'splash',      name: '开屏',       w: 2160, h: 4752, orientation: 'v' },
  { id: 'reward',      name: '奖励中心',   w: 3450, h: 1300, orientation: 'h' },
  { id: 'profile',     name: '个人中心',   w: 4212, h: 1383, orientation: 'h' },
  { id: 'miniapp',     name: '小程序分享', w: 2500, h: 2000, orientation: 'v' },
  { id: 'popup',       name: '营销弹窗',   w: 2240, h: 2816, orientation: 'v' },
  { id: 'banner-oil',  name: '油电banner', w: 3326, h: 1472, orientation: 'h' },
  { id: 'banner-new',  name: '新增banner', w: 4578, h: 1200, orientation: 'h' },
];

// 当前生成任务状态 { sizeId: { status:'loading'|'done'|'error', url, error } }
const state = { jobs: {} };

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  renderSizeList();
  loadConfig();

  document.getElementById('select-all').addEventListener('click', () => {
    document.querySelectorAll('.size-item').forEach(el => setSelected(el, true));
  });
  document.getElementById('deselect-all').addEventListener('click', () => {
    document.querySelectorAll('.size-item').forEach(el => setSelected(el, false));
  });

  // 自定义尺寸
  document.getElementById('toggle-custom-btn').addEventListener('click', () => {
    const form = document.getElementById('custom-size-form');
    form.classList.toggle('open');
  });
  document.getElementById('add-size-btn').addEventListener('click', addCustomSize);
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('download-all-btn').addEventListener('click', handleDownloadAll);
  ['coze-token', 'workflow-id'].forEach(id =>
    document.getElementById(id).addEventListener('change', saveConfig)
  );
});

// ===== 尺寸列表 =====
function renderSizeList() {
  const container = document.getElementById('size-list');
  SIZES.forEach(size => {
    container.appendChild(buildSizeItem(size, false));
  });
}

function buildSizeItem(size, isCustom) {
  const isH = size.orientation === 'h';
  const item = document.createElement('div');
  item.className = 'size-item selected' + (isCustom ? ' size-item-custom' : '');
  item.dataset.id = size.id;
  item.innerHTML = `
    <div class="size-check">✓</div>
    <div class="size-info">
      <div class="size-name">${size.name}</div>
      <div class="size-dim">${size.w} × ${size.h}</div>
    </div>
    <span class="size-orientation ${isH ? 'orientation-h' : 'orientation-v'}">${isH ? '横' : '竖'}</span>
    ${isCustom ? '<button class="size-delete" title="删除">×</button>' : ''}`;
  item.querySelector('.size-check').addEventListener('click', e => {
    e.stopPropagation();
    setSelected(item, !item.classList.contains('selected'));
  });
  item.addEventListener('click', () => setSelected(item, !item.classList.contains('selected')));
  if (isCustom) {
    item.querySelector('.size-delete').addEventListener('click', e => {
      e.stopPropagation();
      const idx = SIZES.findIndex(s => s.id === size.id);
      if (idx !== -1) SIZES.splice(idx, 1);
      item.remove();
    });
  }
  return item;
}

function addCustomSize() {
  const name = document.getElementById('custom-name').value.trim();
  const w = parseInt(document.getElementById('custom-w').value, 10);
  const h = parseInt(document.getElementById('custom-h').value, 10);

  if (!name) return showToast('请填写尺寸名称', 'error');
  if (!w || !h || w <= 0 || h <= 0) return showToast('请填写有效的宽高', 'error');

  const id = 'custom-' + Date.now();
  const size = { id, name, w, h, orientation: w >= h ? 'h' : 'v' };
  SIZES.push(size);

  const container = document.getElementById('size-list');
  container.appendChild(buildSizeItem(size, true));

  // 清空表单
  document.getElementById('custom-name').value = '';
  document.getElementById('custom-w').value = '';
  document.getElementById('custom-h').value = '';
  showToast(`已添加「${name}」`, 'success');
}

function setSelected(item, selected) {
  item.classList.toggle('selected', selected);
  item.querySelector('.size-check').textContent = selected ? '✓' : '';
}

function getSelectedSizes() {
  return [...document.querySelectorAll('.size-item.selected')]
    .map(el => SIZES.find(s => s.id === el.dataset.id))
    .filter(Boolean);
}

// ===== 配置持久化 =====
function saveConfig() {
  localStorage.setItem('coze_token', document.getElementById('coze-token').value);
  localStorage.setItem('workflow_id', document.getElementById('workflow-id').value);
}
function loadConfig() {
  const t = localStorage.getItem('coze_token');
  const w = localStorage.getItem('workflow_id');
  if (t) document.getElementById('coze-token').value = t;
  if (w) document.getElementById('workflow-id').value = w;
}

// ===== 提示词构建 =====
function buildPrompt(size, inputs) {
  const { theme, headline, buttonText, promptText } = inputs;
  const btn = buttonText || 'Shop Now';
  const isH = size.orientation === 'h';

  const layout = isH
    ? `Horizontal banner layout ${size.w}x${size.h}px: title "${headline}" and CTA button "${btn}" placed on the LEFT side, left-aligned. Main visual element on the RIGHT side.`
    : `Vertical poster layout ${size.w}x${size.h}px: title "${headline}" at the TOP, main visual in the CENTER, CTA button "${btn}" at the BOTTOM.`;

  return [
    `Marketing campaign visual for: ${theme}.`,
    layout,
    promptText ? promptText : '',
    'edge margins, edge spacing.',
    'no nested frames, no poster within poster, single canvas, full-page design.',
    'single main subject, one key visual element, no repetition, no duplicate elements.',
    'no border, no frame, no outline.',
  ].filter(Boolean).join(' ');
}

// ===== 主生成流程 =====
async function handleGenerate() {
  const selectedSizes = getSelectedSizes();
  if (selectedSizes.length === 0) return showToast('请至少选择一种尺寸', 'error');

  const token = document.getElementById('coze-token').value.trim();
  const workflowId = document.getElementById('workflow-id').value.trim();
  if (!token || !workflowId) return showToast('请填写 API Token 和 Workflow ID', 'error');

  const inputs = readInputs();
  if (!inputs.theme || !inputs.headline) return showToast('请填写活动主题和主标题文案', 'error');

  saveConfig();
  setGenerating(true);

  state.jobs = {};
  const grid = document.getElementById('result-grid');
  grid.innerHTML = '';
  document.getElementById('download-all-btn').disabled = true;

  // 用第一个选中尺寸构建 prompt（工作流内部会并行处理所有尺寸）
  const firstSize = selectedSizes[0];
  const prompt = buildPrompt(firstSize, inputs);

  selectedSizes.forEach(size => {
    state.jobs[size.id] = { status: 'loading' };
    grid.appendChild(buildCard(size, 'loading'));
  });

  try {
    const resultMap = await callCozeWorkflowAll(token, workflowId, {
      prompt,
      width: firstSize.w,
      height: firstSize.h,
      size_name: firstSize.name,
    });

    selectedSizes.forEach(size => {
      const url = resultMap[size.id];
      if (url) {
        state.jobs[size.id] = { status: 'done', url };
        refreshCard(size, 'done', url);
      } else {
        state.jobs[size.id] = { status: 'error', error: '未返回图片' };
        refreshCard(size, 'error', null, '未返回图片');
      }
    });
  } catch (err) {
    selectedSizes.forEach(size => {
      state.jobs[size.id] = { status: 'error', error: err.message };
      refreshCard(size, 'error', null, err.message);
    });
  }

  setGenerating(false);

  const doneCount = Object.values(state.jobs).filter(j => j.status === 'done').length;
  document.getElementById('download-all-btn').disabled = doneCount === 0;
  showToast(
    doneCount > 0
      ? `生成完成，${doneCount}/${selectedSizes.length} 张成功`
      : '全部生成失败，请检查配置',
    doneCount === selectedSizes.length ? 'success' : doneCount > 0 ? 'info' : 'error'
  );
}

function readInputs() {
  return {
    theme:         document.getElementById('theme').value.trim(),
    headline:      document.getElementById('headline').value.trim(),
    buttonText:    document.getElementById('button-text').value.trim(),
    promptText: document.getElementById('prompt-text').value.trim(),
  };
}

function setGenerating(on) {
  const btn = document.getElementById('generate-btn');
  btn.disabled = on;
  btn.innerHTML = on
    ? '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></span>生成中…'
    : '<span class="btn-icon">✦</span> 一键生成';
}

// ===== 单张重新生成 =====
async function regenOne(size) {
  const token = document.getElementById('coze-token').value.trim();
  const workflowId = document.getElementById('workflow-id').value.trim();
  if (!token || !workflowId) return showToast('请填写 API Token 和 Workflow ID', 'error');

  const inputs = readInputs();
  if (!inputs.theme || !inputs.headline) return showToast('请先填写活动信息', 'error');

  state.jobs[size.id] = { status: 'loading' };
  refreshCard(size, 'loading');

  const prompt = buildPrompt(size, inputs);
  try {
    const resultMap = await callCozeWorkflowAll(token, workflowId, {
      prompt,
      width: size.w,
      height: size.h,
      size_name: size.name,
    });
    const url = resultMap[size.id];
    if (url) {
      state.jobs[size.id] = { status: 'done', url };
      refreshCard(size, 'done', url);
    } else {
      state.jobs[size.id] = { status: 'error', error: '未返回图片' };
      refreshCard(size, 'error', null, '未返回图片');
    }
  } catch (err) {
    state.jobs[size.id] = { status: 'error', error: err.message };
    refreshCard(size, 'error', null, err.message);
  }

  const doneCount = Object.values(state.jobs).filter(j => j.status === 'done').length;
  document.getElementById('download-all-btn').disabled = doneCount === 0;
}

// ===== 调用扣子工作流（返回 sizeId → url 映射）=====
async function callCozeWorkflowAll(token, workflowId, params) {
  const auth = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  const body = { workflow_id: workflowId, parameters: params };
  console.log('[coze] request body:', JSON.stringify(body));

  const resp = await fetch('https://api.coze.cn/v1/workflow/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': auth },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (data.code !== 0) throw new Error(`扣子错误 ${data.code}: ${data.msg}`);

  // 解析返回数据，按 WORKFLOW_KEY_MAP 映射到 sizeId
  let obj = data.data;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch (_) {}
  }

  const resultMap = {};
  if (obj && typeof obj === 'object') {
    for (const [key, sizeId] of Object.entries(WORKFLOW_KEY_MAP)) {
      const val = obj[key];
      if (val) resultMap[sizeId] = extractImageUrl(val);
    }
  }
  return resultMap;
}

// 从单个字段值提取图片 URL
function extractImageUrl(raw) {
  if (typeof raw === 'string' && raw.startsWith('http')) return raw;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (_) {}
  }
  if (typeof obj === 'string' && obj.startsWith('http')) return obj;
  if (obj && typeof obj === 'object') {
    for (const key of ['url', 'image_url', 'img_url', 'image', 'img', 'output', 'result']) {
      const v = obj[key];
      if (typeof v === 'string' && v.startsWith('http')) return v;
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.startsWith('http')) return v;
    }
  }
  return null;
}

// ===== 卡片构建 =====
function buildCard(size, status, url, errMsg) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.id = `card-${size.id}`;
  fillCard(card, size, status, url, errMsg);
  return card;
}

function refreshCard(size, status, url, errMsg) {
  const card = document.getElementById(`card-${size.id}`);
  if (card) fillCard(card, size, status, url, errMsg);
}

function fillCard(card, size, status, url, errMsg) {
  let preview;
  if (status === 'loading') {
    preview = `<div class="card-loading"><div class="spinner"></div><span>生成中…</span></div>`;
  } else if (status === 'done') {
    preview = `<img src="${url}" alt="${size.name}" loading="lazy" />`;
  } else {
    preview = `<div class="card-error"><div class="card-error-icon">✕</div><span>${errMsg || '生成失败'}</span></div>`;
  }

  const canDl = status === 'done' && url;
  card.innerHTML = `
    <div class="card-preview">${preview}</div>
    <div class="card-footer">
      <div class="card-meta">
        <div class="card-name">${size.name}</div>
        <div class="card-size">${size.w} × ${size.h}</div>
      </div>
      <div class="card-actions">
        <button class="btn-icon-sm" title="重新生成" ${status === 'loading' ? 'disabled' : ''} data-action="regen">↺</button>
        <button class="btn-icon-sm" title="下载" ${!canDl ? 'disabled' : ''} data-action="download">↓</button>
      </div>
    </div>`;

  card.querySelector('[data-action="regen"]').addEventListener('click', () => regenOne(size));
  card.querySelector('[data-action="download"]').addEventListener('click', () => {
    const job = state.jobs[size.id];
    if (job?.url) downloadImage(job.url, `${size.name}_${size.w}x${size.h}.png`);
  });
}

// ===== 下载 =====
async function downloadImage(url, filename) {
  try {
    const blob = await fetch(url).then(r => r.blob());
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: filename,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (_) {
    window.open(url, '_blank');
  }
}

async function handleDownloadAll() {
  const done = Object.entries(state.jobs).filter(([, j]) => j.status === 'done');
  if (!done.length) return;
  showToast(`开始下载 ${done.length} 张图片…`, 'info');
  for (const [id, job] of done) {
    const size = SIZES.find(s => s.id === id);
    if (size) {
      await downloadImage(job.url, `${size.name}_${size.w}x${size.h}.png`);
      await new Promise(r => setTimeout(r, 350));
    }
  }
}

// ===== Toast =====
function showToast(msg, type = 'info') {
  let box = document.querySelector('.toast-container');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast-container';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
