import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { papers, questions } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type PaperInput = {
  id: string;
  title: string;
  source?: string;
  subject?: string;
  examDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

type QuestionInput = {
  id: string;
  paperId: string;
  number: string;
  title?: string;
  answerText?: string;
  tags?: string;
  notes?: string;
  questionBlocks?: ContentBlockInput[];
  answerBlocks?: ContentBlockInput[];
  questionImages?: string[];
  answerImages?: string[];
  questionImage?: string;
  answerImage?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ContentBlockInput = { id?: string; type: "text"; text: string } | { id?: string; type: "image"; src: string };
const richPrefix = "__RICH_CONTENT_V1__";

const unauthorized = () => Response.json({ error: "请先登录" }, { status: 401 });

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const action = new URL(request.url).searchParams.get("action");
  const db = getDb();
  const paperRows = await db.select().from(papers).where(eq(papers.userId, user.userId)).orderBy(desc(papers.updatedAt));
  const questionRows = await db.select().from(questions).where(eq(questions.userId, user.userId)).orderBy(questions.createdAt);

  if (action === "export") {
    const exportedQuestions = await Promise.all(questionRows.map(async ({ userId: _userId, questionImageKey, answerImageKey, title, answerText, ...question }) => {
      const questionImages = await imagesAsDataUrls(questionImageKey);
      const answerImages = await imagesAsDataUrls(answerImageKey);
      return { ...question, questionBlocks: decodeStoredContent(title, questionImages), answerBlocks: decodeStoredContent(answerText, answerImages) };
    }));
    return Response.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      papers: paperRows.map(({ userId: _userId, ...paper }) => paper),
      questions: exportedQuestions,
    });
  }

  return Response.json({
    user: { displayName: user.displayName, email: user.email },
    papers: paperRows.map(({ userId: _userId, ...paper }) => paper),
    questions: questionRows.map(({ userId: _userId, questionImageKey, answerImageKey, title, answerText, ...question }) => {
      const questionImages = imageUrls(question.id, "question", questionImageKey, question.updatedAt);
      const answerImages = imageUrls(question.id, "answer", answerImageKey, question.updatedAt);
      return { ...question, questionBlocks: decodeStoredContent(title, questionImages), answerBlocks: decodeStoredContent(answerText, answerImages) };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const body = await request.json() as { action?: string; payload?: unknown };
  const db = getDb();

  try {
    if (body.action === "savePaper") {
      const paper = body.payload as PaperInput;
      validatePaper(paper);
      const timestamp = new Date().toISOString();
      await db.insert(papers).values({
        id: paper.id,
        userId: user.userId,
        title: paper.title.trim(),
        source: paper.source?.trim() ?? "",
        subject: paper.subject?.trim() ?? "",
        examDate: paper.examDate ?? "",
        notes: paper.notes?.trim() ?? "",
        createdAt: paper.createdAt ?? timestamp,
        updatedAt: timestamp,
      }).onConflictDoUpdate({
        target: papers.id,
        set: {
          title: paper.title.trim(), source: paper.source?.trim() ?? "", subject: paper.subject?.trim() ?? "",
          examDate: paper.examDate ?? "", notes: paper.notes?.trim() ?? "", updatedAt: timestamp,
        },
      });
      return Response.json({ ok: true });
    }

    if (body.action === "saveQuestion") {
      await saveQuestion(user.userId, body.payload as QuestionInput);
      return Response.json({ ok: true });
    }

    if (body.action === "deleteQuestion") {
      await deleteQuestion(user.userId, String(body.payload));
      return Response.json({ ok: true });
    }

    if (body.action === "deletePaper") {
      const paperId = String(body.payload);
      const ownedQuestions = await db.select().from(questions).where(and(eq(questions.userId, user.userId), eq(questions.paperId, paperId)));
      const keys = ownedQuestions.flatMap((question) => [...parseKeys(question.questionImageKey), ...parseKeys(question.answerImageKey)]);
      if (keys.length && env.BUCKET) await env.BUCKET.delete(keys);
      await db.delete(questions).where(and(eq(questions.userId, user.userId), eq(questions.paperId, paperId)));
      await db.delete(papers).where(and(eq(papers.userId, user.userId), eq(papers.id, paperId)));
      return Response.json({ ok: true });
    }

    if (body.action === "import") {
      const backup = body.payload as { papers?: PaperInput[]; questions?: QuestionInput[] };
      if (!Array.isArray(backup.papers) || !Array.isArray(backup.questions)) throw new Error("备份格式无效");
      for (const paper of backup.papers) {
        validatePaper(paper);
        const timestamp = paper.updatedAt ?? new Date().toISOString();
        await db.insert(papers).values({
          id: paper.id, userId: user.userId, title: paper.title, source: paper.source ?? "", subject: paper.subject ?? "",
          examDate: paper.examDate ?? "", notes: paper.notes ?? "", createdAt: paper.createdAt ?? timestamp, updatedAt: timestamp,
        }).onConflictDoUpdate({
          target: papers.id,
          set: { userId: user.userId, title: paper.title, source: paper.source ?? "", subject: paper.subject ?? "", examDate: paper.examDate ?? "", notes: paper.notes ?? "", updatedAt: timestamp },
        });
      }
      for (const question of backup.questions) await saveQuestion(user.userId, question, true);
      return Response.json({ ok: true, papers: backup.papers.length, questions: backup.questions.length });
    }

    return Response.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 400 });
  }
}

async function saveQuestion(userId: string, question: QuestionInput, importing = false) {
  if (!question?.id || !question.paperId || !String(question.number ?? "").trim()) throw new Error("题目信息不完整");
  const db = getDb();
  const [paper] = await db.select({ id: papers.id }).from(papers).where(and(eq(papers.id, question.paperId), eq(papers.userId, userId))).limit(1);
  if (!paper) throw new Error("模拟卷不存在");
  const [existing] = await db.select().from(questions).where(and(eq(questions.id, question.id), eq(questions.userId, userId))).limit(1);
  const timestamp = importing ? (question.updatedAt ?? new Date().toISOString()) : new Date().toISOString();
  const questionImageValues = question.questionBlocks ? question.questionBlocks.filter((block): block is Extract<ContentBlockInput, { type: "image" }> => block.type === "image").map((block) => block.src) : question.questionImages ?? (question.questionImage ? [question.questionImage] : question.questionImage === "" ? [] : undefined);
  const answerImageValues = question.answerBlocks ? question.answerBlocks.filter((block): block is Extract<ContentBlockInput, { type: "image" }> => block.type === "image").map((block) => block.src) : question.answerImages ?? (question.answerImage ? [question.answerImage] : question.answerImage === "" ? [] : undefined);
  const questionImageKey = await updateImages(userId, question.id, "question", questionImageValues, existing?.questionImageKey ?? null);
  const answerImageKey = await updateImages(userId, question.id, "answer", answerImageValues, existing?.answerImageKey ?? null);
  const values = {
    id: question.id,
    userId,
    paperId: question.paperId,
    number: String(question.number).trim(),
    title: question.questionBlocks ? encodeStoredContent(question.questionBlocks) : question.title?.trim() ?? "",
    answerText: question.answerBlocks ? encodeStoredContent(question.answerBlocks) : question.answerText ?? "",
    tags: question.tags?.trim() ?? "",
    notes: question.notes?.trim() ?? "",
    questionImageKey,
    answerImageKey,
    createdAt: question.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const { id: _id, ...updates } = values;
  await db.insert(questions).values(values).onConflictDoUpdate({ target: questions.id, set: updates });
  await db.update(papers).set({ updatedAt: timestamp }).where(and(eq(papers.id, question.paperId), eq(papers.userId, userId)));
}

async function deleteQuestion(userId: string, id: string) {
  const db = getDb();
  const [question] = await db.select().from(questions).where(and(eq(questions.id, id), eq(questions.userId, userId))).limit(1);
  if (!question) return;
  const keys = [...parseKeys(question.questionImageKey), ...parseKeys(question.answerImageKey)];
  if (keys.length && env.BUCKET) await env.BUCKET.delete(keys);
  await db.delete(questions).where(and(eq(questions.id, id), eq(questions.userId, userId)));
}

async function updateImages(userId: string, questionId: string, kind: "question" | "answer", values: string[] | undefined, existingValue: string | null) {
  if (values === undefined) return existingValue;
  const existingKeys = parseKeys(existingValue);
  const nextKeys: string[] = [];
  for (const value of values) {
    if (value.startsWith("/api/image")) {
      const index = Number(new URL(value, "https://local.invalid").searchParams.get("index") ?? 0);
      if (existingKeys[index]) nextKeys.push(existingKeys[index]);
      continue;
    }
    const decoded = decodeDataUrl(value);
    if (!decoded) continue;
    if (!env.BUCKET) throw new Error("云端图片存储未配置");
    const key = `${userId}/${questionId}/${kind}/${crypto.randomUUID()}`;
    await env.BUCKET.put(key, decoded.bytes, { httpMetadata: { contentType: decoded.contentType } });
    nextKeys.push(key);
  }
  const removed = existingKeys.filter((key) => !nextKeys.includes(key));
  if (removed.length && env.BUCKET) await env.BUCKET.delete(removed);
  return nextKeys.length ? JSON.stringify(nextKeys) : null;
}

async function imagesAsDataUrls(value: string | null) {
  if (!env.BUCKET) return [];
  return (await Promise.all(parseKeys(value).map(async (key) => {
    const object = await env.BUCKET.get(key);
    if (!object) return "";
    const bytes = new Uint8Array(await object.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return `data:${object.httpMetadata?.contentType ?? "image/png"};base64,${btoa(binary)}`;
  }))).filter(Boolean);
}

function parseKeys(value: string | null | undefined) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [value]; }
  catch { return [value]; }
}

function imageUrls(questionId: string, kind: "question" | "answer", value: string | null, updatedAt: string) {
  return parseKeys(value).map((_, index) => `/api/image?id=${encodeURIComponent(questionId)}&kind=${kind}&index=${index}&v=${encodeURIComponent(updatedAt)}`);
}

function encodeStoredContent(blocks: ContentBlockInput[]) {
  return richPrefix + JSON.stringify(blocks.map((block) => block.type === "text" ? { type: "text", text: block.text } : { type: "image" }));
}

function decodeStoredContent(value: string, images: string[]): ContentBlockInput[] {
  if (value.startsWith(richPrefix)) {
    try {
      const parsed = JSON.parse(value.slice(richPrefix.length)) as Array<{ type?: string; text?: string }>;
      let imageIndex = 0;
      const blocks = parsed.flatMap((block, index): ContentBlockInput[] => {
        if (block.type === "text") return [{ id: `text-${index}`, type: "text", text: String(block.text ?? "") }];
        if (block.type === "image" && images[imageIndex]) return [{ id: `image-${index}`, type: "image", src: images[imageIndex++] }];
        return [];
      });
      while (imageIndex < images.length) blocks.push({ id: `image-extra-${imageIndex}`, type: "image", src: images[imageIndex++] });
      return blocks.length ? blocks : [{ id: "text-empty", type: "text", text: "" }];
    } catch { /* fall through to legacy content */ }
  }
  const blocks: ContentBlockInput[] = value ? [{ id: "text-legacy", type: "text", text: value }] : [];
  images.forEach((src, index) => blocks.push({ id: `image-legacy-${index}`, type: "image", src }));
  return blocks.length ? blocks : [{ id: "text-empty", type: "text", text: "" }];
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match || !match[1].startsWith("image/")) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { contentType: match[1], bytes };
}

function validatePaper(paper: PaperInput) {
  if (!paper?.id || !paper.title?.trim()) throw new Error("请填写模拟卷名称");
}
