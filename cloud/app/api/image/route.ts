import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { questions } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response("未登录", { status: 401 });
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const kind = params.get("kind");
  const index = Number(params.get("index") ?? 0);
  if (!id || (kind !== "question" && kind !== "answer")) return new Response("参数无效", { status: 400 });
  const db = getDb();
  const [question] = await db.select().from(questions).where(and(eq(questions.id, id), eq(questions.userId, user.userId))).limit(1);
  const value = kind === "question" ? question?.questionImageKey : question?.answerImageKey;
  const key = parseKeys(value)[Number.isInteger(index) && index >= 0 ? index : 0];
  if (!key || !env.BUCKET) return new Response("图片不存在", { status: 404 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("图片不存在", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function parseKeys(value: string | null | undefined) {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [value]; }
  catch { return [value]; }
}
