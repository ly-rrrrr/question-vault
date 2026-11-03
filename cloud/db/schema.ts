import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const papers = sqliteTable(
  "papers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    source: text("source").notNull().default(""),
    subject: text("subject").notNull().default(""),
    examDate: text("exam_date").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("papers_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    paperId: text("paper_id").notNull(),
    number: text("number").notNull(),
    title: text("title").notNull().default(""),
    answerText: text("answer_text").notNull().default(""),
    tags: text("tags").notNull().default(""),
    notes: text("notes").notNull().default(""),
    questionImageKey: text("question_image_key"),
    answerImageKey: text("answer_image_key"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("questions_user_paper_idx").on(table.userId, table.paperId),
    index("questions_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);
