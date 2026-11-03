"use client";

import {
  BookOpen, ChevronLeft, ChevronRight, Cloud, Download, FileText, FolderOpen,
  ImageIcon, Pencil, Plus, Search, Trash2, Upload, X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Paper = { id: string; title: string; source: string; subject: string; examDate: string; notes: string; createdAt: string; updatedAt: string };
type ContentBlock = { id: string; type: "text"; text: string } | { id: string; type: "image"; src: string };
type Question = { id: string; paperId: string; number: string; tags: string; notes: string; questionBlocks: ContentBlock[]; answerBlocks: ContentBlock[]; createdAt: string; updatedAt: string };
type View = "papers" | "questions" | "paper";

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

export default function QuestionVault({ initialDisplayName }: { initialDisplayName: string }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [view, setView] = useState<View>("papers");
  const [paperId, setPaperId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ type: "paper"; item?: Paper } | { type: "question"; item?: Question } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [viewer, setViewer] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      const data = await response.json() as { error?: string; papers: Paper[]; questions: Question[] };
      if (!response.ok) throw new Error(data.error || "同步失败");
      setPapers(data.papers);
      setQuestions(data.questions);
    } catch (error) {
      notify(error instanceof Error ? error.message : "同步失败");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { loadData(); }, [loadData]);

  const callApi = async (action: string, payload: unknown) => {
    const response = await fetch("/api/data", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }),
    });
    const data = await response.json() as { error?: string; [key: string]: unknown };
    if (!response.ok) throw new Error(data.error || "操作失败");
    return data;
  };

  const currentPaper = papers.find((paper) => paper.id === paperId);
  const filteredPapers = useMemo(() => papers.filter((paper) => !query || [paper.title, paper.source, paper.subject, paper.notes].join(" ").toLowerCase().includes(query.toLowerCase())), [papers, query]);
  const filteredQuestions = useMemo(() => questions.filter((question) => {
    const paper = papers.find((item) => item.id === question.paperId);
    const inScope = view !== "paper" || question.paperId === paperId;
    return inScope && (!query || [question.notes, blocksText(question.questionBlocks), blocksText(question.answerBlocks), question.tags, paper?.title, paper?.source].join(" ").toLowerCase().includes(query.toLowerCase()));
  }), [questions, papers, query, view, paperId]);

  const openPaper = (id: string) => { setPaperId(id); setView("paper"); setExpandedId(null); };
  const navigate = (next: View) => { setView(next); if (next !== "paper") setPaperId(null); setExpandedId(null); };

  const savePaper = async (paper: Paper) => {
    setSaving(true);
    try { await callApi("savePaper", paper); setModal(null); await loadData(); notify("模拟卷已同步"); }
    catch (error) { notify(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const saveQuestion = async (question: Question) => {
    setSaving(true);
    try { await callApi("saveQuestion", question); setExpandedId(question.id); setModal(null); await loadData(); notify("题目已同步"); }
    catch (error) { notify(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const deleteQuestion = async (question: Question) => {
    if (!confirm(`确定删除第 ${question.number} 题吗？`)) return;
    await callApi("deleteQuestion", question.id); setExpandedId(null); await loadData(); notify("题目已删除");
  };

  const deletePaper = async (paper: Paper) => {
    if (!confirm(`确定删除「${paper.title}」及其全部题目吗？`)) return;
    await callApi("deletePaper", paper.id); navigate("papers"); await loadData(); notify("模拟卷已删除");
  };

  const exportBackup = async () => {
    const response = await fetch("/api/data?action=export");
    if (!response.ok) return notify("导出失败");
    const blob = await response.blob();
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `题库云端备份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm(`将导入 ${data.papers?.length ?? 0} 份模拟卷和 ${data.questions?.length ?? 0} 道题到云端，继续吗？`)) return;
      setSaving(true); await callApi("import", data); await loadData(); notify("本地题库已迁移到云端");
    } catch (error) { notify(error instanceof Error ? error.message : "导入失败"); }
    finally { setSaving(false); if (importRef.current) importRef.current.value = ""; }
  };

  return (
    <div className="vault-shell">
      <aside className="vault-sidebar">
        <div className="vault-brand"><span><BookOpen size={21} /></span><div><strong>题库</strong><small>私有云同步</small></div></div>
        <nav>
          <button className={view === "papers" || view === "paper" ? "active" : ""} onClick={() => navigate("papers")}><FolderOpen size={19} />模拟卷</button>
          <button className={view === "questions" ? "active" : ""} onClick={() => navigate("questions")}><FileText size={19} />全部题目</button>
        </nav>
        <div className="recent"><div className="side-label">最近模拟卷</div>{papers.slice(0, 6).map((paper) => <button key={paper.id} onClick={() => openPaper(paper.id)}><strong>{paper.title}</strong><span>{paper.source || "来源未填写"}</span></button>)}</div>
        <div className="sync-card"><Cloud size={17} /><div><strong>已连接私有云</strong><span>{initialDisplayName}</span></div></div>
        <div className="backup-actions">
          <button onClick={exportBackup}><Download size={14} />导出</button>
          <button onClick={() => importRef.current?.click()}><Upload size={14} />迁移本地数据</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => importBackup(event.target.files?.[0])} />
        </div>
      </aside>

      <main className="vault-main">
        <header className="vault-topbar">
          <div className="mobile-logo"><BookOpen size={20} /><strong>题库</strong></div>
          <label className="vault-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、来源或答案…" /></label>
          <span className="cloud-status"><Cloud size={14} />已同步</span>
          <button className="primary top-create" onClick={() => view === "paper" ? setModal({ type: "question" }) : setModal({ type: "paper" })}><Plus size={18} />{view === "paper" ? "添加题目" : "新建模拟卷"}</button>
        </header>

        <section className="vault-content">
          {loading ? <Loading /> : view === "papers" ? (
            <PapersView papers={filteredPapers} questions={questions} onOpen={openPaper} onCreate={() => setModal({ type: "paper" })} />
          ) : view === "questions" ? (
            <QuestionsView title="全部题目" subtitle="跨模拟卷复习所有已收录内容" questions={filteredQuestions} papers={papers} expandedId={expandedId} setExpandedId={setExpandedId} onEdit={(item) => { setPaperId(item.paperId); setModal({ type: "question", item }); }} onDelete={deleteQuestion} onViewImage={setViewer} />
          ) : currentPaper ? (
            <div>
              <div className="page-head paper-head"><div><button className="back" onClick={() => navigate("papers")}><ChevronLeft size={16} />返回</button><span className="eyebrow">{currentPaper.source || "来源未填写"}</span><h1>{currentPaper.title}</h1><p>{currentPaper.subject || "未分类"} · {formatDate(currentPaper.examDate || currentPaper.createdAt)}{currentPaper.notes ? ` · ${currentPaper.notes}` : ""}</p></div><div className="head-buttons"><button onClick={() => setModal({ type: "paper", item: currentPaper })}><Pencil size={15} />编辑</button><button className="danger" onClick={() => deletePaper(currentPaper)}><Trash2 size={15} />删除</button></div></div>
              <QuestionsView title="" subtitle="" questions={filteredQuestions} papers={papers} expandedId={expandedId} setExpandedId={setExpandedId} onEdit={(item) => setModal({ type: "question", item })} onDelete={deleteQuestion} onViewImage={setViewer} emptyAction={() => setModal({ type: "question" })} />
            </div>
          ) : null}
        </section>
      </main>

      <nav className="mobile-nav">
        <button className={view === "papers" || view === "paper" ? "active" : ""} onClick={() => navigate("papers")}><FolderOpen size={20} />模拟卷</button>
        <button className={view === "questions" ? "active" : ""} onClick={() => navigate("questions")}><FileText size={20} />全部题</button>
        <button onClick={() => view === "paper" ? setModal({ type: "question" }) : setModal({ type: "paper" })}><Plus size={20} />新建</button>
      </nav>

      {modal?.type === "paper" && <PaperModal item={modal.item} saving={saving} onClose={() => setModal(null)} onSave={savePaper} />}
      {modal?.type === "question" && paperId && <QuestionModal item={modal.item} paperId={paperId} nextNumber={questions.filter((question) => question.paperId === paperId).length + 1} saving={saving} onClose={() => setModal(null)} onSave={saveQuestion} notify={notify} />}
      {viewer && <div className="image-viewer" onClick={() => setViewer("")}><button><X /></button><img src={viewer} alt="大图预览" /></div>}
      {toast && <div className="vault-toast">{toast}</div>}
      {saving && <div className="saving-indicator"><Cloud size={15} />正在同步…</div>}
    </div>
  );
}

function PapersView({ papers, questions, onOpen, onCreate }: { papers: Paper[]; questions: Question[]; onOpen: (id: string) => void; onCreate: () => void }) {
  return <><div className="page-head"><div><span className="eyebrow">私有题库</span><h1>我的模拟卷</h1><p>云端同步，随时在电脑或手机上继续复习。</p></div></div><div className="stats"><div><span>模拟卷</span><strong>{papers.length}</strong></div><div><span>已收录题目</span><strong>{questions.length}</strong></div><div><span>已完善答案</span><strong>{questions.filter((q) => hasBlockContent(q.answerBlocks)).length}</strong></div></div>{papers.length ? <div className="paper-grid">{papers.map((paper) => { const count = questions.filter((question) => question.paperId === paper.id).length; return <button className="paper-card" key={paper.id} onClick={() => onOpen(paper.id)}><span className="source-pill">{paper.source || "来源未填写"}</span><ChevronRight size={18} /><h2>{paper.title}</h2><p>{paper.subject || "未分类"} · {formatDate(paper.examDate || paper.createdAt)}</p><div><span>题目数量</span><strong>{count} 题</strong></div></button>; })}</div> : <Empty title="还没有模拟卷" text="新建模拟卷，或导入本地版导出的 JSON 备份。" action="新建模拟卷" onAction={onCreate} />}</>;
}

function QuestionsView({ title, subtitle, questions, papers, expandedId, setExpandedId, onEdit, onDelete, onViewImage, emptyAction }: { title: string; subtitle: string; questions: Question[]; papers: Paper[]; expandedId: string | null; setExpandedId: (id: string | null) => void; onEdit: (item: Question) => void; onDelete: (item: Question) => void; onViewImage: (url: string) => void; emptyAction?: () => void }) {
  return <>{title && <div className="page-head"><div><span className="eyebrow">聚合复习</span><h1>{title}</h1><p>{subtitle}</p></div></div>}{questions.length ? <div className="question-list">{questions.map((question) => { const paper = papers.find((item) => item.id === question.paperId); const expanded = expandedId === question.id; const hasAnswer = hasBlockContent(question.answerBlocks); const summary = question.notes || blocksText(question.questionBlocks).split("\n")[0]; return <article className="question-card" key={question.id}><button className="question-summary" onClick={() => setExpandedId(expanded ? null : question.id)}><span className="q-number">{question.number}</span><span className="q-info"><strong>{summary || `第 ${question.number} 题`}</strong><small>{paper?.title}</small>{question.tags && <span className="q-tag">{question.tags}</span>}</span><span className={hasAnswer ? "status" : "status pending"}>{hasAnswer ? "已有答案" : "待补答案"}</span></button>{expanded && <div className="question-detail"><div><h3>题目</h3><RichContent blocks={question.questionBlocks} empty="还没有题目内容" onViewImage={onViewImage} /></div><div><h3>答案与解析</h3><RichContent blocks={question.answerBlocks} empty="还没有答案" onViewImage={onViewImage} /></div><div className="detail-actions"><button onClick={() => onEdit(question)}><Pencil size={15} />编辑</button><button className="danger" onClick={() => onDelete(question)}><Trash2 size={15} />删除</button></div></div>}</article>; })}</div> : <Empty title="暂无题目" text="还没有收录题目，可以从文字或图片开始。" action={emptyAction ? "添加第一道题" : undefined} onAction={emptyAction} />}</>;
}

function RichContent({ blocks, empty, onViewImage }: { blocks: ContentBlock[]; empty: string; onViewImage: (url: string) => void }) {
  const visible = blocks.filter((block) => block.type === "image" || block.text.trim());
  return visible.length ? <div className="rich-content">{visible.map((block) => block.type === "text" ? <div key={block.id} className="plain-content">{block.text}</div> : <img key={block.id} src={block.src} alt="内容图片" onClick={() => onViewImage(block.src)} />)}</div> : <div className="image-empty"><ImageIcon />{empty}</div>;
}

function PaperModal({ item, saving, onClose, onSave }: { item?: Paper; saving: boolean; onClose: () => void; onSave: (paper: Paper) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); onSave({ id: item?.id || uid(), title: String(data.title), source: String(data.source), subject: String(data.subject), examDate: String(data.examDate), notes: String(data.notes), createdAt: item?.createdAt || now(), updatedAt: now() }); };
  return <Modal title={item ? "编辑模拟卷" : "新建模拟卷"} onClose={onClose}><form className="vault-form" onSubmit={submit}><label className="full"><span>模拟卷名称 *</span><input name="title" required defaultValue={item?.title} placeholder="例：2026 届第一次模考" /></label><label><span>来源</span><input name="source" defaultValue={item?.source} placeholder="机构 / 教研室 / 网站" /></label><label><span>科目</span><input name="subject" defaultValue={item?.subject} placeholder="例：数学" /></label><label><span>考试日期</span><input name="examDate" type="date" defaultValue={item?.examDate} /></label><label className="full"><span>备注</span><textarea name="notes" defaultValue={item?.notes} /></label><div className="form-actions full"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={saving}>{saving ? "同步中…" : "保存"}</button></div></form></Modal>;
}

function QuestionModal({ item, paperId, nextNumber, saving, onClose, onSave, notify }: { item?: Question; paperId: string; nextNumber: number; saving: boolean; onClose: () => void; onSave: (question: Question) => void; notify: (message: string) => void }) {
  const [questionBlocks, setQuestionBlocks] = useState<ContentBlock[]>(item?.questionBlocks?.length ? item.questionBlocks : [{ id: uid(), type: "text", text: "" }]);
  const [answerBlocks, setAnswerBlocks] = useState<ContentBlock[]>(item?.answerBlocks?.length ? item.answerBlocks : [{ id: uid(), type: "text", text: "" }]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); onSave({ id: item?.id || uid(), paperId, number: String(data.number), tags: String(data.tags), notes: String(data.notes), questionBlocks, answerBlocks, createdAt: item?.createdAt || now(), updatedAt: now() }); };
  return <Modal title={item ? "编辑题目" : "添加题目"} onClose={onClose} wide><form className="vault-form" onSubmit={submit}><label><span>题号 *</span><input name="number" required defaultValue={item?.number || nextNumber} /></label><label><span>标签</span><input name="tags" defaultValue={item?.tags} placeholder="例：概率、易错" /></label><label className="full"><span>备注</span><input name="notes" defaultValue={item?.notes} placeholder="用于题目列表中的摘要，如：二叉树层序遍历" /></label><RichContentEditor label="题目内容" blocks={questionBlocks} onChange={setQuestionBlocks} notify={notify} /><RichContentEditor label="答案 / 解析" blocks={answerBlocks} onChange={setAnswerBlocks} notify={notify} /><div className="form-actions full"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={saving}>{saving ? "同步中…" : "保存题目"}</button></div></form></Modal>;
}

function RichContentEditor({ label, blocks, onChange, notify }: { label: string; blocks: ContentBlock[]; onChange: (blocks: ContentBlock[]) => void; notify: (message: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  useEffect(() => { if (editor.current && !editor.current.dataset.ready) { editor.current.innerHTML = blocksToEditorHtml(blocks); editor.current.dataset.ready = "true"; } }, [blocks]);
  const rememberCaret = () => { const selection = window.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : null; if (range && editor.current?.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange(); };
  const restoreCaret = () => { const root = editor.current; if (!root) return null; root.focus(); const selection = window.getSelection(); if (!selection) return null; selection.removeAllRanges(); const range = savedRange.current && root.contains(savedRange.current.commonAncestorContainer) ? savedRange.current : document.createRange(); if (!savedRange.current || !root.contains(range.commonAncestorContainer)) range.selectNodeContents(root), range.collapse(false); selection.addRange(range); return range; };
  const sync = () => { if (editor.current) onChange(editorToBlocks(editor.current)); rememberCaret(); };
  const insertImage = (src: string) => { const root = editor.current; const range = restoreCaret(); if (!root || !range) return; const image = document.createElement("img"); image.src = src; image.alt = "粘贴的图片"; const spacer = document.createElement("br"); range.deleteContents(); range.insertNode(spacer); range.insertNode(image); range.setStartAfter(spacer); range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); savedRange.current = range.cloneRange(); sync(); };
  const addFiles = async (files: Array<File | Blob>) => { const valid = files.filter((file) => { if (file.size > 12 * 1024 * 1024) { notify("单张图片请小于 12MB"); return false; } return true; }); for (const file of valid) { const src = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); }); insertImage(src); } };
  const pasteFromButton = async () => { try { const items = await navigator.clipboard.read(); const files: Blob[] = []; for (const item of items) for (const type of item.types.filter((entry) => entry.startsWith("image/"))) files.push(await item.getType(type)); if (!files.length) return notify("剪贴板中没有图片"); await addFiles(files); } catch { notify("无法读取剪贴板，请在输入框中按 Ctrl+V"); } };
  return <div className="qq-editor-wrap full"><span className="field-label">{label}</span><div ref={editor} className="qq-editor" contentEditable suppressContentEditableWarning data-placeholder="在这里输入文字，也可以直接 Ctrl+V 粘贴截图…" onInput={sync} onKeyUp={rememberCaret} onMouseUp={rememberCaret} onFocus={rememberCaret} onPaste={(event) => { const files = [...event.clipboardData.items].filter((entry) => entry.type.startsWith("image/")).map((entry) => entry.getAsFile()).filter(Boolean) as File[]; if (files.length) { event.preventDefault(); void addFiles(files); return; } const text = event.clipboardData.getData("text/plain"); if (text) { event.preventDefault(); document.execCommand("insertText", false, text); sync(); } }} /><div className="qq-editor-actions"><button type="button" className="primary" onMouseDown={(event) => event.preventDefault()} onClick={() => void pasteFromButton()}>粘贴剪贴板截图</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => input.current?.click()}>选择本地图片</button><span>图片会插入到当前光标位置</span></div><input ref={input} type="file" accept="image/*" multiple hidden onChange={(event) => { void addFiles([...event.target.files || []]); event.currentTarget.value = ""; }} /></div>;
}

function blocksToEditorHtml(blocks: ContentBlock[]) { return blocks.map((block) => block.type === "image" ? `<img src="${escapeHtml(block.src)}" alt="内容图片"><br>` : `<div>${escapeHtml(block.text).replace(/\n/g, "<br>")}</div>`).join(""); }
function editorToBlocks(root: HTMLElement): ContentBlock[] {
  const blocks: ContentBlock[] = []; let text = "";
  const flush = () => { const value = text.replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, ""); if (value) blocks.push({ id: uid(), type: "text", text: value }); text = ""; };
  const walk = (node: Node) => { if (node.nodeType === Node.TEXT_NODE) { text += node.textContent ?? ""; return; } if (!(node instanceof HTMLElement)) return; if (node.tagName === "IMG") { flush(); blocks.push({ id: uid(), type: "image", src: (node as HTMLImageElement).src }); return; } if (node.tagName === "BR") { text += "\n"; return; } const block = ["DIV", "P", "LI", "H1", "H2", "H3"].includes(node.tagName); [...node.childNodes].forEach(walk); if (block && text && !text.endsWith("\n")) text += "\n"; };
  [...root.childNodes].forEach(walk); flush(); return blocks.length ? blocks : [{ id: uid(), type: "text", text: "" }];
}

function blocksText(blocks: ContentBlock[]) { return blocks.filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text").map((block) => block.text).join("\n"); }
function hasBlockContent(blocks: ContentBlock[]) { return blocks.some((block) => block.type === "image" || block.text.trim()); }

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="modal-layer"><div className="modal-backdrop" onClick={onClose} /><section className={`vault-modal ${wide ? "wide" : ""}`}><header><h2>{title}</h2><button onClick={onClose}><X /></button></header>{children}</section></div>; }
function Empty({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) { return <div className="empty-state"><span><Plus /></span><h2>{title}</h2><p>{text}</p>{action && onAction && <button className="primary" onClick={onAction}>{action}</button>}</div>; }
function Loading() { return <div className="loading"><Cloud className="spin" />正在从私有云同步题库…</div>; }
function formatDate(value: string) { if (!value) return "未设置日期"; return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)); }

function renderReadableText(raw: string) {
  let text = escapeHtml(raw.replace(/\r\n/g, "\n").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[ \t]+\n/g, "\n").trim());
  const codeBlocks: string[] = [];
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => { codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`); return `\n@@CODE${codeBlocks.length - 1}@@\n`; });
  const blocks = text.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  let html = "";
  for (const block of blocks) {
    if (/^@@CODE\d+@@$/.test(block)) { html += codeBlocks[Number(block.match(/\d+/)?.[0])]; continue; }
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const heading = lines.length === 1 && lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const level = heading[1].length; html += `<h${level}>${inlineFormat(heading[2])}</h${level}>`; continue; }
    const ordered = lines.map((line) => line.match(/^\d+[.、）)]\s*(.+)$/));
    const bullets = lines.map((line) => line.match(/^[-*•·] ?\s*(.+)$/));
    if (ordered.every(Boolean) || bullets.every(Boolean)) { const items = ordered.every(Boolean) ? ordered : bullets; const type = ordered.every(Boolean) ? "ol" : "ul"; html += `<${type}>${items.map((item) => `<li>${inlineFormat(item?.[1] || "")}</li>`).join("")}</${type}>`; continue; }
    html += renderTextLines(lines);
  }
  return html;
}

function renderTextLines(lines: string[]) {
  let html = "", buffer: string[] = [], conclusion: string[] = [];
  const flush = () => { if (!buffer.length) return; const joined = joinSoftLines(buffer); html += isMathBlock(joined) ? `<div class="math-block">${inlineFormat(joined)}</div>` : `<p>${inlineFormat(joined)}</p>`; buffer = []; };
  for (const line of lines) {
    if (conclusion.length) conclusion.push(line);
    else if (/^(?:因此|所以|综上|最终答案|答案)[，：:]/.test(line)) { flush(); conclusion.push(line); }
    else if (line.length <= 24 && /^[\u3400-\u9fff]/.test(line) && /[：:]$/.test(line) && !/[=∫∑√\[\]()]/.test(line)) { flush(); html += `<h3 class="answer-section-title">${inlineFormat(line.replace(/[：:]$/, ""))}</h3>`; }
    else buffer.push(line);
  }
  flush(); if (conclusion.length) html += `<p class="answer-conclusion">${inlineFormat(joinSoftLines(conclusion))}</p>`; return html;
}
function joinSoftLines(lines: string[]) { return lines.reduce((result, line) => !result ? line : `${result}${/[\u3400-\u9fff，。！？：；、（【《“]$/.test(result) && /^[\u3400-\u9fff，。！？：；、）】》”]/.test(line) ? "" : " "}${line}`, "").replace(/\s+([，。！？：；、）】》])/g, "$1").replace(/([（【《])\s+/g, "$1").replace(/\s{2,}/g, " ").trim(); }
function isMathBlock(text: string) { const plain = text.replace(/&[a-z]+;/gi, ""); return /[=∫∑√±≠≤≥]/.test(plain) && (plain.match(/[\u3400-\u9fff]/g) || []).length <= 3; }
function inlineFormat(text: string) { return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char); }
