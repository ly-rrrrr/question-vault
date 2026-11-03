import { requireChatGPTUser } from "./chatgpt-auth";
import QuestionVault from "./question-vault";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <QuestionVault initialDisplayName={user.displayName} />;
}
