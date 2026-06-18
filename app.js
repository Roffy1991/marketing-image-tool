const ARK_MAX_EDGE = 4096;

// GPT Image 2 支持的固定尺寸列表（宽x高）
const OPENAI_SUPPORTED_SIZES = [
  { w: 1024, h: 1024 },
  { w: 1024, h: 1536 },
  { w: 1536, h: 1024 },
];

// 找到与目标宽高比最接近的 GPT Image 2 尺寸
function mapToOpenAISize(w, h) {
  const targetRatio = w / h;
  let best = OPENAI_SUPPORTED_SIZES[0];
  let bestDiff = Infinity;
  for (const s of OPENAI_SUPPORTED_SIZES) {
    const diff = Math.abs(s.w / s.h - targetRatio);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return best;
}

// ===== 尺寸配置 =====
const SIZES = [
  { id: 'splash',      name: '开屏',       w: 2160, h: 4752, orientation: 'v' },
  { id: 'reward',      name: '奖励中心',   w: 3450, h: 1300, orientation: 'h' },
  { id: 'profile',     name: '个人中心',   w: 4212, h: 1383, orientation: 'h' },
  { id: 'miniapp',     name: '小程序分享', w: 2500, h: 2000, orientation: 'v' },
  { id: 'popup',       name: '营销弹窗',   w: 2240, h: 2816, orientation: 'v' },
  { id: 'banner-oil',  name: '油电banner', w: 3326, h: 1472, orientation: 'h' },
  { id: 'banner-new',  name: '新增banner', w: 4578, h: 1200, orientation: 'h' },
  { id: 'special',     name: '特殊尺寸',   w: 2808, h: 448,  orientation: 'h' },
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
  document.getElementById('download-selected-btn').addEventListener('click', handleDownloadSelected);
  document.getElementById('result-select-all').addEventListener('click', () => setAllCardsSelected(true));
  document.getElementById('result-deselect-all').addEventListener('click', () => setAllCardsSelected(false));
  initLightbox();
  ['ark-api-key', 'ark-model', 'ark-model-custom', 'openai-api-key', 'openai-quality'].forEach(id =>
    document.getElementById(id).addEventListener('change', saveConfig)
  );
  document.getElementById('ark-model').addEventListener('change', () => {
    const isCustom = document.getElementById('ark-model').value === 'custom';
    document.getElementById('ark-model-custom-field').style.display = isCustom ? '' : 'none';
  });

  // 供应商切换
  document.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.provider-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const provider = tab.dataset.provider;
      document.getElementById('provider-panel-ark').style.display = provider === 'ark' ? '' : 'none';
      document.getElementById('provider-panel-openai').style.display = provider === 'openai' ? '' : 'none';
      saveConfig();
    });
  });
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
function getModelId() {
  const sel = document.getElementById('ark-model').value;
  if (sel === 'custom') return document.getElementById('ark-model-custom').value.trim();
  return sel;
}

function getProvider() {
  const activeTab = document.querySelector('.provider-tab.active');
  return activeTab ? activeTab.dataset.provider : 'ark';
}

function saveConfig() {
  localStorage.setItem('ark_api_key', document.getElementById('ark-api-key').value);
  localStorage.setItem('ark_model', document.getElementById('ark-model').value);
  localStorage.setItem('ark_model_custom', document.getElementById('ark-model-custom').value);
  localStorage.setItem('openai_api_key', document.getElementById('openai-api-key').value);
  localStorage.setItem('openai_quality', document.getElementById('openai-quality').value);
  localStorage.setItem('provider', getProvider());
}
function loadConfig() {
  const k = localStorage.getItem('ark_api_key');
  const m = localStorage.getItem('ark_model');
  const mc = localStorage.getItem('ark_model_custom');
  const ok = localStorage.getItem('openai_api_key');
  const oq = localStorage.getItem('openai_quality');
  const provider = localStorage.getItem('provider') || 'ark';

  if (k) document.getElementById('ark-api-key').value = k;
  if (m) {
    document.getElementById('ark-model').value = m;
    if (m === 'custom') document.getElementById('ark-model-custom-field').style.display = '';
  }
  if (mc) document.getElementById('ark-model-custom').value = mc;
  if (ok) document.getElementById('openai-api-key').value = ok;
  if (oq) document.getElementById('openai-quality').value = oq;

  // 恢复供应商 Tab
  document.querySelectorAll('.provider-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.provider === provider);
  });
  document.getElementById('provider-panel-ark').style.display = provider === 'ark' ? '' : 'none';
  document.getElementById('provider-panel-openai').style.display = provider === 'openai' ? '' : 'none';
}

// ===== 提示词构建 =====
// 用输入框的值覆盖提示词模板里对应字段（格式：字段名：值）
function overridePromptField(text, fieldNames, value) {
  if (!value) return text;
  const pattern = new RegExp(`(${fieldNames.join('|')})\\s*[：:][^\\n]*`, 'g');
  if (pattern.test(text)) {
    return text.replace(new RegExp(`(${fieldNames.join('|')})\\s*[：:][^\\n]*`, 'g'), `$1：${value}`);
  }
  return text;
}

function buildPrompt(size, inputs, canvasSize) {
  const { theme, headline, tagText, buttonText, promptText } = inputs;
  const isH = size.orientation === 'h';
  // 用真实送给 API 的画布尺寸描述比例，避免与实际生成画布的宽高比不一致导致画中画
  const canvas = canvasSize || size;

  // 用输入框内容覆盖提示词模板里的对应字段
  let mergedPrompt = promptText || '';
  mergedPrompt = overridePromptField(mergedPrompt, ['主标题'], theme);
  mergedPrompt = overridePromptField(mergedPrompt, ['副标题'], headline);
  mergedPrompt = overridePromptField(mergedPrompt, ['标签'], tagText);
  mergedPrompt = overridePromptField(mergedPrompt, ['按钮文字', '按钮'], buttonText);

  // 输入框有值但提示词里没有对应字段，则追加到最前面
  const extraFields = [];
  if (theme && !/主标题\s*[：:]/.test(mergedPrompt)) extraFields.push(`主标题：${theme}`);
  if (headline && !/副标题\s*[：:]/.test(mergedPrompt)) extraFields.push(`副标题：${headline}`);
  if (tagText && !/标签\s*[：:]/.test(mergedPrompt)) extraFields.push(`标签：${tagText}`);
  if (buttonText && !/按钮文字\s*[：:]|按钮\s*[：:]/.test(mergedPrompt)) extraFields.push(`按钮文字：${buttonText}`);

  const structuredPrefix = extraFields.join('\n');

  const layout = isH
    ? `Horizontal banner layout ${canvas.w}x${canvas.h}px. Main visual element on the RIGHT half. Title, subtitle, tag and CTA button all LEFT-aligned on the LEFT half, text and button must NOT touch the edge, keep safe margin at least 8% from left and top/bottom edges.`
    : `Vertical poster layout ${canvas.w}x${canvas.h}px. Title at the TOP, main visual in the CENTER, CTA button at the BOTTOM. All text and buttons must NOT touch the edge, keep safe margin at least 8% from all edges.`;

  return [
    structuredPrefix,
    mergedPrompt,
    layout,
    'Include bleed area: extend background and visual elements to all edges, but keep all text, buttons and key elements within the safe zone away from edges.',
    'no nested frames, no poster within poster, single canvas, full-page design.',
    'single main subject, no repetition, no border, no frame.',
  ].filter(Boolean).join('\n');
}

// ===== 等比缩小到 API 限制范围内 =====
function clampSize(w, h) {
  if (w <= ARK_MAX_EDGE && h <= ARK_MAX_EDGE) return { w, h };
  const scale = Math.min(ARK_MAX_EDGE / w, ARK_MAX_EDGE / h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

// ===== 主生成流程 =====
async function handleGenerate() {
  const selectedSizes = getSelectedSizes();
  if (selectedSizes.length === 0) return showToast('请至少选择一种尺寸', 'error');

  const provider = getProvider();
  const apiKey = provider === 'openai'
    ? document.getElementById('openai-api-key').value.trim()
    : document.getElementById('ark-api-key').value.trim();
  if (!apiKey) return showToast('请填写 API Key', 'error');
  if (provider === 'ark' && !getModelId()) return showToast('请选择或填写模型', 'error');

  const inputs = readInputs();
  if (!inputs.promptText && !inputs.theme && !inputs.headline) return showToast('请填写活动信息或提示词', 'error');

  saveConfig();
  setGenerating(true);

  state.jobs = {};
  const grid = document.getElementById('result-grid');
  grid.innerHTML = '';
  document.getElementById('download-all-btn').disabled = true;

  selectedSizes.forEach(size => {
    state.jobs[size.id] = { status: 'loading' };
    grid.appendChild(buildCard(size, 'loading'));
  });

  // 每个尺寸并行调用 API
  await Promise.all(selectedSizes.map(async size => {
    try {
      let url, actualSize;
      if (provider === 'openai') {
        const quality = document.getElementById('openai-quality').value;
        const prompt = buildPrompt(size, inputs, mapToOpenAISize(size.w, size.h));
        ({ url, actualSize } = await callOpenAIImageGen(apiKey, quality, prompt, size));
      } else {
        const model = getModelId();
        const prompt = buildPrompt(size, inputs, clampSize(size.w, size.h));
        url = await callArkImageGen(apiKey, model, prompt, size);
      }
      state.jobs[size.id] = { status: 'done', url, actualSize };
      refreshCard(size, 'done', url, null, actualSize);
    } catch (err) {
      state.jobs[size.id] = { status: 'error', error: err.message };
      refreshCard(size, 'error', null, err.message);
    }
  }));

  setGenerating(false);

  const doneCount = Object.values(state.jobs).filter(j => j.status === 'done').length;
  document.getElementById('download-all-btn').disabled = doneCount === 0;
  updateSelectUI();
  showToast(
    doneCount > 0
      ? `生成完成，${doneCount}/${selectedSizes.length} 张成功`
      : '全部生成失败，请检查配置',
    doneCount === selectedSizes.length ? 'success' : doneCount > 0 ? 'info' : 'error'
  );
}

function readInputs() {
  return {
    theme:      document.getElementById('theme').value.trim(),
    headline:   document.getElementById('headline').value.trim(),
    tagText:    document.getElementById('tag-text').value.trim(),
    buttonText: document.getElementById('button-text').value.trim(),
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
  const provider = getProvider();
  const apiKey = provider === 'openai'
    ? document.getElementById('openai-api-key').value.trim()
    : document.getElementById('ark-api-key').value.trim();
  if (!apiKey) return showToast('请填写 API Key', 'error');
  if (provider === 'ark' && !getModelId()) return showToast('请选择或填写模型', 'error');

  const inputs = readInputs();
  if (!inputs.promptText && !inputs.theme && !inputs.headline) return showToast('请填写活动信息或提示词', 'error');

  state.jobs[size.id] = { status: 'loading' };
  refreshCard(size, 'loading');

  try {
    let url, actualSize;
    if (provider === 'openai') {
      const quality = document.getElementById('openai-quality').value;
      const prompt = buildPrompt(size, inputs, mapToOpenAISize(size.w, size.h));
      ({ url, actualSize } = await callOpenAIImageGen(apiKey, quality, prompt, size));
    } else {
      const model = getModelId();
      const prompt = buildPrompt(size, inputs, clampSize(size.w, size.h));
      url = await callArkImageGen(apiKey, model, prompt, size);
    }
    state.jobs[size.id] = { status: 'done', url, actualSize };
    refreshCard(size, 'done', url, null, actualSize);
  } catch (err) {
    state.jobs[size.id] = { status: 'error', error: err.message };
    refreshCard(size, 'error', null, err.message);
  }

  const doneCount = Object.values(state.jobs).filter(j => j.status === 'done').length;
  document.getElementById('download-all-btn').disabled = doneCount === 0;
}

// ===== 调用火山引擎图片生成 API =====
async function callArkImageGen(apiKey, model, prompt, size) {
  const { w, h } = clampSize(size.w, size.h);
  const body = {
    model,
    prompt,
    size: `${w}x${h}`,
    response_format: 'b64_json',
  };
  console.log('[ark] request:', JSON.stringify({ ...body, prompt: prompt.slice(0, 50) + '…' }));

  const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  // 优先用 b64_json 转 blob URL，彻底避开跨域下载问题
  const b64 = data?.data?.[0]?.b64_json;
  if (b64) {
    const byteStr = atob(b64);
    const arr = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
    const blob = new Blob([arr], { type: 'image/png' });
    return URL.createObjectURL(blob);
  }
  // 兼容仍返回 url 的情况
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error('未返回图片数据');
  return url;
}

// ===== 调用 OpenAI GPT Image 2 API =====
async function callOpenAIImageGen(apiKey, quality, prompt, size) {
  const actualSize = mapToOpenAISize(size.w, size.h);
  const body = {
    model: 'gpt-image-1',
    prompt,
    size: `${actualSize.w}x${actualSize.h}`,
    quality,
    n: 1,
  };
  console.log('[openai] request:', JSON.stringify({ ...body, prompt: prompt.slice(0, 50) + '…' }));

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  // GPT Image 2 返回 b64_json，需转为 blob URL
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('未返回图片数据');
  const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
  const url = URL.createObjectURL(blob);
  return { url, actualSize };
}

// ===== 卡片构建 =====
function buildCard(size, status, url, errMsg, actualSize) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.id = `card-${size.id}`;
  fillCard(card, size, status, url, errMsg, actualSize);
  return card;
}

function refreshCard(size, status, url, errMsg, actualSize) {
  const card = document.getElementById(`card-${size.id}`);
  if (card) fillCard(card, size, status, url, errMsg, actualSize);
}

function fillCard(card, size, status, url, errMsg, actualSize) {
  const wasSelected = card.classList.contains('card-selected');

  let preview;
  if (status === 'loading') {
    preview = `<div class="card-skeleton">
      <div style="padding:16px;height:100%;display:flex;flex-direction:column;gap:10px;">
        <div class="skeleton-block" style="height:55%;border-radius:4px;"></div>
        <div class="skeleton-block" style="height:12%;width:70%;"></div>
        <div class="skeleton-block" style="height:10%;width:45%;"></div>
        <div style="margin-top:auto;display:flex;gap:8px;">
          <div class="skeleton-block" style="height:28px;flex:1;"></div>
          <div class="skeleton-block" style="height:28px;flex:1;"></div>
        </div>
      </div>
    </div>`;
  } else if (status === 'done') {
    preview = `<img src="${url}" alt="${size.name}" loading="lazy" />`;
  } else {
    preview = `<div class="card-error"><div class="card-error-icon">✕</div><span>${errMsg || '生成失败'}</span></div>`;
  }

  const sizeLabel = actualSize
    ? `${size.w} × ${size.h} <span class="card-actual-size">实际 ${actualSize.w}×${actualSize.h}</span>`
    : `${size.w} × ${size.h}`;

  const canDl = status === 'done' && url;
  card.innerHTML = `
    ${canDl ? '<div class="card-checkbox" data-action="toggle-select"><div class="card-check-inner"></div></div>' : ''}
    <div class="card-preview">${preview}</div>
    <div class="card-footer">
      <div class="card-meta">
        <div class="card-name">${size.name}</div>
        <div class="card-size">${sizeLabel}</div>
      </div>
      <div class="card-actions">
        <button class="btn-icon-sm" title="重新生成" ${status === 'loading' ? 'disabled' : ''} data-action="regen">↺</button>
        <button class="btn-icon-sm" title="下载" ${!canDl ? 'disabled' : ''} data-action="download">↓</button>
      </div>
    </div>`;

  // 恢复勾选状态
  if (canDl && wasSelected) card.classList.add('card-selected');

  const img = card.querySelector('.card-preview img');
  if (img) img.addEventListener('click', () => openLightbox(img.src, `${size.name}  ${size.w} × ${size.h}`));

  const checkbox = card.querySelector('[data-action="toggle-select"]');
  if (checkbox) {
    checkbox.addEventListener('click', e => {
      e.stopPropagation();
      card.classList.toggle('card-selected');
      updateSelectUI();
    });
  }

  card.querySelector('[data-action="regen"]').addEventListener('click', () => regenOne(size));
  card.querySelector('[data-action="download"]').addEventListener('click', () => {
    const job = state.jobs[size.id];
    if (job?.url) downloadImage(job.url, `${size.name}_${size.w}x${size.h}.png`);
  });
}

function updateSelectUI() {
  const allDoneCards = [...document.querySelectorAll('.result-card')].filter(c => c.querySelector('.card-checkbox'));
  const selectedCards = allDoneCards.filter(c => c.classList.contains('card-selected'));
  const hasAny = allDoneCards.length > 0;
  const hasSelected = selectedCards.length > 0;

  document.getElementById('result-select-all').style.display = hasAny ? '' : 'none';
  document.getElementById('result-deselect-all').style.display = hasAny ? '' : 'none';
  document.getElementById('download-selected-btn').style.display = hasAny ? '' : 'none';
  document.getElementById('download-selected-btn').disabled = !hasSelected;

  const countEl = document.getElementById('select-count');
  if (hasSelected) {
    countEl.textContent = `已选 ${selectedCards.length}/${allDoneCards.length}`;
    countEl.style.display = '';
  } else {
    countEl.style.display = 'none';
  }
}

function setAllCardsSelected(selected) {
  document.querySelectorAll('.result-card').forEach(card => {
    if (card.querySelector('.card-checkbox')) {
      card.classList.toggle('card-selected', selected);
    }
  });
  updateSelectUI();
}

// ===== 下载 =====
async function downloadImage(url, filename) {
  // blob URL（OpenAI）直接下载；远程 URL（火山引擎）用 canvas 绕过跨域
  if (url.startsWith('blob:')) {
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  // 用 <img> + canvas 把远程图片画出来再导出 blob，绕开跨域 fetch 限制
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('canvas export failed')); return; }
        const blobUrl = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: blobUrl, download: filename });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      // canvas 也失败（服务器不允许），最后降级直接打开
      window.open(url, '_blank');
      resolve();
    };
    img.src = url;
  });
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

async function handleDownloadSelected() {
  const selected = [...document.querySelectorAll('.result-card.card-selected')];
  if (!selected.length) return;
  showToast(`开始下载 ${selected.length} 张图片…`, 'info');
  for (const card of selected) {
    const sizeId = card.id.replace('card-', '');
    const job = state.jobs[sizeId];
    const size = SIZES.find(s => s.id === sizeId);
    if (job?.url && size) {
      await downloadImage(job.url, `${size.name}_${size.w}x${size.h}.png`);
      await new Promise(r => setTimeout(r, 350));
    }
  }
}

// ===== 灯箱 =====
function initLightbox() {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
}

function openLightbox(url, label) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox-label').textContent = label;
  lb.classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
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
