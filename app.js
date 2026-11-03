const DB_NAME = 'question-vault';
const DB_VERSION = 1;
const state = { papers: [], questions: [], view: 'papers', paperId: null, expandedId: null, query: '', subject: 'all' };
let db;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => new Date().toISOString();
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const formatDate = value => value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : '未设置日期';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('papers')) database.createObjectStore('papers', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('questions')) database.createObjectStore('questions', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeAction(storeName, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = action(store);
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const getAll = store => storeAction(store, 'readonly', s => s.getAll());
const put = (store, data) => storeAction(store, 'readwrite', s => s.put(data));
const remove = (store, id) => storeAction(store, 'readwrite', s => s.delete(id));

async function reload() {
  [state.papers, state.questions] = await Promise.all([getAll('papers'), getAll('questions')]);
  state.papers.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  state.questions.sort((a,b) => Number(a.number) - Number(b.number) || new Date(a.createdAt) - new Date(b.createdAt));
  renderRecent();
  render();
}

function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

function setActiveNav(view) {
  $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
}

function renderRecent() {
  $('#recentPapers').innerHTML = state.papers.slice(0, 6).map(p => `
    <button class="recent-item" data-open-paper="${p.id}"><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.source || '未填写来源')}</span></button>`).join('') || '<div style="padding:8px 10px;color:#a0a5ae;font-size:11px">暂无模拟卷</div>';
}

function filteredPapers() {
  const q = state.query.trim().toLowerCase();
  return state.papers.filter(p => (state.subject === 'all' || p.subject === state.subject) && (!q || [p.title,p.source,p.subject,p.notes].join(' ').toLowerCase().includes(q)));
}

function filteredQuestions(scopePaperId = null) {
  const q = state.query.trim().toLowerCase();
  return state.questions.filter(item => {
    const paper = state.papers.find(p => p.id === item.paperId);
    return (!scopePaperId || item.paperId === scopePaperId) && (!q || [item.notes,blocksText(contentBlocks(item, 'question')),blocksText(contentBlocks(item, 'answer')),item.tags,paper?.title,paper?.source].join(' ').toLowerCase().includes(q));
  });
}

function render() {
  setActiveNav(state.view === 'paper' ? 'papers' : state.view);
  $('#primaryAction').textContent = state.view === 'paper' ? '+  添加题目' : '+  新建模拟卷';
  if (state.view === 'papers') renderPapers();
  else if (state.view === 'paper') renderPaper();
  else renderAllQuestions();
}

function renderPapers() {
  const papers = filteredPapers();
  const subjects = [...new Set(state.papers.map(p => p.subject).filter(Boolean))];
  const totalQuestions = state.questions.length;
  $('#content').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">题库管理</div><h1>我的模拟卷</h1><p>按来源归档，让每一道题和答案都有迹可循。</p></div></div>
    <div class="stats">
      <div class="stat"><span>模拟卷</span><strong>${state.papers.length}</strong></div>
      <div class="stat"><span>已收录题目</span><strong>${totalQuestions}</strong></div>
      <div class="stat"><span>已完善答案</span><strong>${state.questions.filter(q => hasBlockContent(contentBlocks(q, 'answer'))).length}</strong></div>
    </div>
    <div class="toolbar">
      <select id="subjectFilter"><option value="all">全部科目</option>${subjects.map(s => `<option ${state.subject===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select>
      <span class="result-count">共 ${papers.length} 份</span>
    </div>
    ${papers.length ? `<div class="paper-grid">${papers.map(paperCard).join('')}</div>` : emptyState('还没有模拟卷', '先建立一份模拟卷，再开始录入题目。', '新建模拟卷', 'new-paper')}`;
}

function paperCard(p) {
  const count = state.questions.filter(q => q.paperId === p.id).length;
  return `<article class="paper-card" data-open-paper="${p.id}">
    <div class="paper-card-top"><span class="source-pill">${escapeHtml(p.source || '来源未填写')}</span><span class="more-btn">›</span></div>
    <h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.subject || '未分类')} · ${formatDate(p.examDate || p.createdAt)}</p>
    <div class="paper-progress"><span>题目数量</span><strong>${count} 题</strong></div>
  </article>`;
}

function renderPaper() {
  const paper = state.papers.find(p => p.id === state.paperId);
  if (!paper) { state.view = 'papers'; render(); return; }
  const questions = filteredQuestions(paper.id);
  $('#content').innerHTML = `
    <div class="page-head">
      <div><button class="quiet-btn" data-back style="margin-bottom:15px">← 返回模拟卷</button><div class="eyebrow">${escapeHtml(paper.source || '来源未填写')}</div><h1>${escapeHtml(paper.title)}</h1><p>${escapeHtml(paper.subject || '未分类')} · ${formatDate(paper.examDate || paper.createdAt)}${paper.notes ? ` · ${escapeHtml(paper.notes)}` : ''}</p></div>
      <div class="head-actions"><button class="secondary-btn" data-edit-paper="${paper.id}">编辑信息</button><button class="danger-btn" data-delete-paper="${paper.id}">删除</button></div>
    </div>
    <div class="toolbar"><span class="result-count">共 ${questions.length} 道题</span></div>
    ${questions.length ? `<div class="question-list">${questions.map(q => questionCard(q, paper)).join('')}</div>` : emptyState('暂无题目', '上传题目截图，再录入答案内容或答案截图。', '添加第一道题', 'new-question')}`;
}

function renderAllQuestions() {
  const questions = filteredQuestions();
  $('#content').innerHTML = `
    <div class="page-head"><div><div class="eyebrow">聚合视图</div><h1>全部题目</h1><p>跨模拟卷查找题目与答案。</p></div></div>
    <div class="toolbar"><span class="result-count">共 ${questions.length} 道题</span></div>
    ${questions.length ? `<div class="question-list">${questions.map(q => questionCard(q, state.papers.find(p=>p.id===q.paperId))).join('')}</div>` : emptyState('没有找到题目', '试试更换搜索词，或先录入一些题目。', '新建模拟卷', 'new-paper')}`;
}

function questionCard(q, paper) {
  const expanded = state.expandedId === q.id;
  const questionBlocks = contentBlocks(q, 'question');
  const answerBlocks = contentBlocks(q, 'answer');
  const done = hasBlockContent(answerBlocks);
  return `<article class="question-card">
    <div class="question-summary" data-toggle-question="${q.id}">
      <div class="q-number">${escapeHtml(q.number || '?')}</div>
      <div class="q-summary-main"><div class="q-title">${escapeHtml(q.notes || blocksText(questionBlocks).split('\n')[0] || `第 ${q.number || '?'} 题`)}</div><div class="q-meta"><span>${escapeHtml(paper?.title || '未知模拟卷')}</span></div>${q.tags ? `<span class="q-tag">${escapeHtml(q.tags)}</span>` : ''}</div>
      <span class="status-badge ${done?'':'incomplete'}">${done?'已有答案':'待补答案'}</span>
    </div>
    ${expanded ? `<div class="question-detail">
      <div class="detail-block"><h4>题目</h4>${renderContentBlocks(questionBlocks, '还没有题目内容')}</div>
      <div class="detail-block"><h4>答案与解析</h4>${renderContentBlocks(answerBlocks, '还没有录入答案')}</div>
      <div class="detail-actions"><button class="secondary-btn" data-edit-question="${q.id}">编辑</button><button class="danger-btn" data-delete-question="${q.id}">删除</button></div>
    </div>` : ''}
  </article>`;
}

function imageList(question, kind) {
  const plural = question[`${kind}Images`];
  if (Array.isArray(plural)) return plural.filter(Boolean);
  const legacy = question[`${kind}Image`];
  return legacy ? [legacy] : [];
}

function contentBlocks(question, kind) {
  const saved = question[`${kind}Blocks`];
  if (Array.isArray(saved) && saved.length) return saved;
  const text = kind === 'question' ? question.title : question.answerText;
  const blocks = text ? [{ id: uid(), type: 'text', text }] : [];
  imageList(question, kind).forEach(src => blocks.push({ id: uid(), type: 'image', src }));
  return blocks.length ? blocks : [{ id: uid(), type: 'text', text: '' }];
}

function blocksText(blocks) { return blocks.filter(block => block.type === 'text').map(block => block.text || '').join('\n'); }
function hasBlockContent(blocks) { return blocks.some(block => block.type === 'image' || (block.text || '').trim()); }
function renderContentBlocks(blocks, empty) {
  const visible = blocks.filter(block => block.type === 'image' || (block.text || '').trim());
  return visible.length ? `<div class="rich-content">${visible.map(block => block.type === 'text' ? `<div class="plain-content">${escapeHtml(block.text)}</div>` : `<img class="detail-image" data-view-image src="${block.src}" alt="内容图片" />`).join('')}</div>` : `<div class="no-image">${empty}</div>`;
}

function renderReadableText(raw) {
  let text = escapeHtml(raw
    .replace(/\r\n/g, '\n')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim());
  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => { codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`); return `\n@@CODE${codeBlocks.length-1}@@\n`; });
  const blocks = text.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
  let html = '';

  for (const block of blocks) {
    if (/^@@CODE\d+@@$/.test(block)) {
      html += codeBlocks[Number(block.match(/\d+/)[0])];
      continue;
    }

    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    const heading = lines.length === 1 && lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html += `<h${level}>${inlineFormat(heading[2])}</h${level}>`;
      continue;
    }

    const orderedItems = lines.map(line => line.match(/^\d+[.、）)]\s*(.+)$/));
    const bulletItems = lines.map(line => line.match(/^[-*•·] ?\s*(.+)$/));
    if (orderedItems.every(Boolean) || bulletItems.every(Boolean)) {
      const items = orderedItems.every(Boolean) ? orderedItems : bulletItems;
      const type = orderedItems.every(Boolean) ? 'ol' : 'ul';
      html += `<${type}>${items.map(item => `<li>${inlineFormat(joinSoftLines([item[1]]))}</li>`).join('')}</${type}>`;
      continue;
    }

    if (lines.every(line => line.startsWith('&gt;'))) {
      html += `<blockquote>${inlineFormat(joinSoftLines(lines.map(line => line.slice(4).trim())))}</blockquote>`;
      continue;
    }

    html += renderTextLines(lines);
  }
  return html;
}

function renderTextLines(lines) {
  let html = '';
  let buffer = [];
  let conclusion = [];
  const flush = () => {
    if (!buffer.length) return;
    const joined = joinSoftLines(buffer);
    html += isMathBlock(joined)
      ? `<div class="math-block">${inlineFormat(joined)}</div>`
      : `<p>${inlineFormat(joined)}</p>`;
    buffer = [];
  };

  for (const line of lines) {
    if (conclusion.length) {
      conclusion.push(line);
    } else if (/^(?:因此|所以|综上|最终答案|答案)[，：:]/.test(line)) {
      flush();
      conclusion.push(line);
    } else if (isSectionTitle(line)) {
      flush();
      html += `<h3 class="answer-section-title">${inlineFormat(line.replace(/[：:]$/, ''))}</h3>`;
    } else {
      buffer.push(line);
    }
  }
  flush();
  if (conclusion.length) html += `<p class="answer-conclusion">${inlineFormat(joinSoftLines(conclusion))}</p>`;
  return html;
}

function joinSoftLines(lines) {
  return lines.reduce((result, line) => {
    if (!result) return line;
    const noSpace = /[\u3400-\u9fff，。！？：；、（【《“]$/.test(result)
      && /^[\u3400-\u9fff，。！？：；、）】》”]/.test(line);
    return `${result}${noSpace ? '' : ' '}${line}`;
  }, '')
    .replace(/\s+([，。！？：；、）】》])/g, '$1')
    .replace(/([（【《])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isSectionTitle(text) {
  return text.length <= 24
    && /^[\u3400-\u9fff]/.test(text)
    && /[：:]$/.test(text)
    && !/[=∫∑√\[\]()]/.test(text);
}

function isMathBlock(text) {
  const plain = text.replace(/&[a-z]+;/gi, '');
  if (!/[=∫∑√±≠≤≥]/.test(plain)) return false;
  const chineseCount = (plain.match(/[\u3400-\u9fff]/g) || []).length;
  return chineseCount <= 3;
}

function inlineFormat(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

function emptyState(title, description, action, dataAction) {
  return `<div class="empty"><div><div class="empty-icon">+</div><h3>${title}</h3><p>${description}</p><button class="primary-btn" data-action="${dataAction}">${action}</button></div></div>`;
}

function showModal(title, body) {
  $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modal').hidden = false;
  setTimeout(() => $('#modalBody input:not([type=file]), #modalBody textarea')?.focus(), 30);
}
function closeModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; }

function paperForm(p = {}) {
  showModal(p.id ? '编辑模拟卷' : '新建模拟卷', `<form id="paperForm" class="form" data-id="${p.id||''}">
    <div class="form-grid">
      <div class="field full"><label>模拟卷名称 *</label><input name="title" required maxlength="80" value="${escapeHtml(p.title||'')}" placeholder="例：2026 届高三第一次模考" /></div>
      <div class="field"><label>来源</label><input name="source" maxlength="80" value="${escapeHtml(p.source||'')}" placeholder="例：某教研室 / 机构" /></div>
      <div class="field"><label>科目</label><input name="subject" maxlength="30" value="${escapeHtml(p.subject||'')}" placeholder="例：数学" /></div>
      <div class="field"><label>考试日期</label><input name="examDate" type="date" value="${escapeHtml(p.examDate||'')}" /></div>
      <div class="field full"><label>备注</label><textarea name="notes" maxlength="300" placeholder="卷子版本、使用场景等">${escapeHtml(p.notes||'')}</textarea></div>
    </div>
    <div class="form-actions"><button type="button" class="secondary-btn" data-close-modal>取消</button><button class="primary-btn">保存模拟卷</button></div>
  </form>`);
}

function questionForm(q = {}) {
  const paper = state.papers.find(p => p.id === state.paperId);
  if (!paper && !q.id) return toast('请先选择一份模拟卷');
  showModal(q.id ? '编辑题目' : '添加题目', `<form id="questionForm" class="form" data-id="${q.id||''}" data-paper="${q.paperId||state.paperId}">
    <div class="form-grid">
      <div class="field"><label>题号 *</label><input name="number" required maxlength="12" value="${escapeHtml(q.number||String(state.questions.filter(i=>i.paperId===(q.paperId||state.paperId)).length+1))}" placeholder="1" /></div>
      <div class="field"><label>标签</label><input name="tags" maxlength="100" value="${escapeHtml(q.tags||'')}" placeholder="例：选择题、函数、易错" /></div>
      <div class="field full"><label>备注</label><input name="notes" maxlength="160" value="${escapeHtml(q.notes||'')}" placeholder="用于题目列表中的摘要，如：二叉树层序遍历" /></div>
      <div class="field full">${blockEditor('questionBlocks', contentBlocks(q, 'question'), '题目内容')}</div>
      <div class="field full">${blockEditor('answerBlocks', contentBlocks(q, 'answer'), '答案 / 解析')}</div>
    </div>
    <div class="form-actions"><button type="button" class="secondary-btn" data-close-modal>取消</button><button class="primary-btn">保存题目</button></div>
  </form>`);
  setupBlockEditors();
}

function blockEditor(name, blocks, label) {
  return `<label>${label}</label><div class="qq-editor-wrap" data-block-editor="${name}" data-blocks="${escapeHtml(JSON.stringify(blocks))}"><div class="qq-editor" contenteditable="true" data-placeholder="在这里输入文字，也可以直接 Ctrl+V 粘贴截图…">${blocksToEditorHtml(blocks)}</div><div class="qq-editor-actions"><button type="button" class="drop-btn" data-paste-editor-image>粘贴剪贴板截图</button><button type="button" class="drop-btn" data-choose-editor-image>选择本地图片</button><span>图片会插入到当前光标位置</span></div><input class="block-file-input" type="file" accept="image/*" multiple /></div>`;
}

function setupBlockEditors() {
  $$('[data-block-editor]').forEach(wrapper => {
    const editor = $('.qq-editor', wrapper); const input = $('.block-file-input', wrapper);
    const remember = () => { const selection = window.getSelection(); if (selection?.rangeCount) { const range = selection.getRangeAt(0); if (editor.contains(range.commonAncestorContainer)) editor._savedRange = range.cloneRange(); } };
    editor.addEventListener('input', () => syncEditorBlocks(wrapper));
    ['keyup','mouseup','focus'].forEach(type => editor.addEventListener(type, remember));
    editor.addEventListener('paste', e => {
      const files = [...e.clipboardData.items].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
      if (files.length) { e.preventDefault(); insertEditorImages(wrapper, files); return; }
      const text = e.clipboardData.getData('text/plain');
      if (text) { e.preventDefault(); document.execCommand('insertText', false, text); syncEditorBlocks(wrapper); }
    });
    $('[data-paste-editor-image]', wrapper).addEventListener('mousedown', e => e.preventDefault());
    $('[data-paste-editor-image]', wrapper).addEventListener('click', () => pasteEditorImages(wrapper));
    $('[data-choose-editor-image]', wrapper).addEventListener('mousedown', e => e.preventDefault());
    $('[data-choose-editor-image]', wrapper).addEventListener('click', () => input.click());
    input.addEventListener('change', async () => { await insertEditorImages(wrapper, [...input.files]); input.value = ''; });
  });
}

function getEditorBlocks(editor) { return JSON.parse(editor.dataset.blocks || '[]'); }
function syncEditorBlocks(wrapper) { wrapper.dataset.blocks = JSON.stringify(editorDomToBlocks($('.qq-editor', wrapper))); }
function blocksToEditorHtml(blocks) { return blocks.map(block => block.type === 'image' ? `<img src="${escapeHtml(block.src)}" alt="内容图片"><br>` : `<div>${escapeHtml(block.text || '').replace(/\n/g, '<br>')}</div>`).join(''); }
function editorDomToBlocks(root) {
  const blocks = []; let text = '';
  const flush = () => { const value = text.replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, ''); if (value) blocks.push({ id: uid(), type: 'text', text: value }); text = ''; };
  const walk = node => { if (node.nodeType === Node.TEXT_NODE) { text += node.textContent || ''; return; } if (!(node instanceof HTMLElement)) return; if (node.tagName === 'IMG') { flush(); blocks.push({ id: uid(), type: 'image', src: node.src }); return; } if (node.tagName === 'BR') { text += '\n'; return; } const block = ['DIV','P','LI','H1','H2','H3'].includes(node.tagName); [...node.childNodes].forEach(walk); if (block && text && !text.endsWith('\n')) text += '\n'; };
  [...root.childNodes].forEach(walk); flush(); return blocks.length ? blocks : [{ id: uid(), type: 'text', text: '' }];
}
function restoreEditorCaret(editor) {
  editor.focus(); const selection = window.getSelection(); if (!selection) return null; selection.removeAllRanges(); let range = editor._savedRange;
  if (!range || !editor.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); }
  selection.addRange(range); return range;
}
function insertEditorImage(wrapper, src) {
  const editor = $('.qq-editor', wrapper); const range = restoreEditorCaret(editor); if (!range) return;
  const image = document.createElement('img'); image.src = src; image.alt = '粘贴的图片'; const spacer = document.createElement('br');
  range.deleteContents(); range.insertNode(spacer); range.insertNode(image); range.setStartAfter(spacer); range.collapse(true);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); editor._savedRange = range.cloneRange(); syncEditorBlocks(wrapper);
}
async function insertEditorImages(wrapper, files) {
  const valid = files.filter(file => { if (file.size > 12 * 1024 * 1024) { toast('单张图片请小于 12MB'); return false; } return true; });
  for (const file of valid) { const src = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); }); insertEditorImage(wrapper, src); }
}
async function pasteEditorImages(wrapper) {
  try { const items = await navigator.clipboard.read(); const files = []; for (const item of items) for (const type of item.types.filter(value => value.startsWith('image/'))) files.push(await item.getType(type)); if (!files.length) return toast('剪贴板中没有图片'); await insertEditorImages(wrapper, files); }
  catch { toast('无法读取剪贴板，请在输入框中按 Ctrl+V'); }
}

async function onSubmit(e) {
  if (e.target.id === 'paperForm') {
    e.preventDefault(); const form = e.target; const data = Object.fromEntries(new FormData(form)); const existing = state.papers.find(p=>p.id===form.dataset.id);
    await put('papers', { ...existing, ...data, id: existing?.id || uid(), createdAt: existing?.createdAt || now(), updatedAt: now() });
    closeModal(); await reload(); toast('模拟卷已保存');
  }
  if (e.target.id === 'questionForm') {
    e.preventDefault(); const form = e.target; const data = Object.fromEntries(new FormData(form)); const existing = state.questions.find(q=>q.id===form.dataset.id);
    data.questionBlocks = getEditorBlocks($('[data-block-editor="questionBlocks"]', form));
    data.answerBlocks = getEditorBlocks($('[data-block-editor="answerBlocks"]', form));
    data.questionImage = '';
    data.answerImage = '';
    const record = { ...existing, ...data, paperId: form.dataset.paper, id: existing?.id || uid(), createdAt: existing?.createdAt || now(), updatedAt: now() };
    await put('questions', record);
    const paper = state.papers.find(p=>p.id===record.paperId); if(paper) await put('papers', {...paper, updatedAt: now()});
    state.expandedId = record.id; closeModal(); await reload(); toast('题目已保存');
  }
}

async function deletePaper(id) {
  const paper = state.papers.find(p=>p.id===id); if (!paper || !confirm(`确定删除「${paper.title}」及其全部题目吗？`)) return;
  for (const q of state.questions.filter(q=>q.paperId===id)) await remove('questions', q.id);
  await remove('papers', id); state.view = 'papers'; state.paperId = null; await reload(); toast('模拟卷已删除');
}

async function deleteQuestion(id) {
  if (!confirm('确定删除这道题吗？')) return;
  await remove('questions', id); state.expandedId = null; await reload(); toast('题目已删除');
}

function exportBackup() {
  const payload = { version: 1, exportedAt: now(), papers: state.papers, questions: state.questions };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `题库备份-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href); toast('备份已导出');
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.papers) || !Array.isArray(data.questions)) throw new Error('格式错误');
    if (!confirm(`将导入 ${data.papers.length} 份模拟卷和 ${data.questions.length} 道题，同 ID 数据会被覆盖。继续吗？`)) return;
    for (const p of data.papers) await put('papers', p); for (const q of data.questions) await put('questions', q);
    await reload(); toast('备份已导入');
  } catch { toast('导入失败：请选择有效备份文件'); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-open-paper], [data-toggle-question], [data-action], [data-view-image]'); if (!t) return;
  if (t.matches('[data-close-modal]')) closeModal();
  if (t.dataset.view) { state.view = t.dataset.view; state.paperId = null; state.expandedId = null; render(); }
  if (t.dataset.openPaper) { state.view = 'paper'; state.paperId = t.dataset.openPaper; state.expandedId = null; render(); }
  if (t.dataset.toggleQuestion) { state.expandedId = state.expandedId === t.dataset.toggleQuestion ? null : t.dataset.toggleQuestion; render(); }
  if (t.dataset.action === 'new-paper') paperForm();
  if (t.dataset.action === 'new-question') questionForm();
  if (t.dataset.action === 'reload') location.reload();
  if (t.dataset.editPaper) paperForm(state.papers.find(p=>p.id===t.dataset.editPaper));
  if (t.dataset.deletePaper) deletePaper(t.dataset.deletePaper);
  if (t.dataset.editQuestion) questionForm(state.questions.find(q=>q.id===t.dataset.editQuestion));
  if (t.dataset.deleteQuestion) deleteQuestion(t.dataset.deleteQuestion);
  if (t.matches('[data-back]')) { state.view = 'papers'; state.paperId = null; render(); }
  if (t.matches('[data-view-image]')) { $('#imageViewer img').src = t.src; $('#imageViewer').hidden = false; }
});

document.addEventListener('submit', onSubmit);
$('#modal').addEventListener('click', e => { if (e.target.matches('.modal-backdrop')) closeModal(); });
$('.viewer-close').addEventListener('click', () => $('#imageViewer').hidden = true);
$('#imageViewer').addEventListener('click', e => { if (e.target === $('#imageViewer')) $('#imageViewer').hidden = true; });
$('#primaryAction').addEventListener('click', () => state.view === 'paper' ? questionForm() : paperForm());
$('#quickAddPaper').addEventListener('click', paperForm);
$('#globalSearch').addEventListener('input', e => { state.query = e.target.value; render(); });
$('#content').addEventListener('change', e => { if(e.target.id==='subjectFilter') { state.subject=e.target.value; render(); } });
$('#exportBtn').addEventListener('click', exportBackup);
$('#importInput').addEventListener('change', e => { if(e.target.files[0]) importBackup(e.target.files[0]); e.target.value=''; });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') { e.preventDefault(); $('#globalSearch').focus(); }
  if (e.key === 'Escape') { if(!$('#imageViewer').hidden) $('#imageViewer').hidden = true; else closeModal(); }
});

(async function init() {
  try { db = await openDB(); await reload(); }
  catch (error) { console.error(error); $('#content').innerHTML = emptyState('无法打开本地数据库', '请使用现代浏览器并允许本站点保存数据。', '重试', 'reload'); }
})();
