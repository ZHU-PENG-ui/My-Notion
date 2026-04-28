import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    /** 文档标题 */
    title: v.string(),
    /** 用户ID，关联到Clerk用户 */
    userId: v.string(),
    /** 是否归档 */
    isArchived: v.boolean(),
    /** 父文档ID，用于构建文档层级结构 */
    parentDocument: v.optional(v.id("documents")),
    /** 文档内容，使用BlockNote格式 */
    content: v.optional(v.string()),
    /** 封面图片URL */
    coverImage: v.optional(v.string()),
    /** 文档图标 */
    icon: v.optional(v.string()),
    /** 是否发布 */
    isPublished: v.boolean(),
    /** 是否收藏 */
    isStarred: v.optional(v.boolean()),
    /** 最后编辑时间戳 */
    lastEditedTime: v.optional(v.number()),
    /** 规范化内容哈希，用于判断是否需要重建索引 */
    contentHash: v.optional(v.string()),
    /** 当前文档的最新版本号，用于后续 patch 乐观锁 */
    latestVersion: v.optional(v.number()),
    /** 知识库索引状态，避免 AI 链路侵入文档主流程 */
    indexStatus: v.optional(
      v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    ),
    /** 最近一次完成知识索引的时间 */
    lastIndexedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentDocument"]),

  documentVersions: defineTable({
    /** 关联的主文档 ID */
    documentId: v.id("documents"),
    /** 文档版本号，单文档内递增 */
    version: v.number(),
    /** 该版本对应的完整内容快照 */
    content: v.string(),
    /** 快照内容哈希，用于去重和冲突检测 */
    contentHash: v.string(),
    /** 创建时间戳 */
    createdAt: v.number(),
    /** 创建者 ID，通常为当前登录用户 */
    createdBy: v.string(),
    /** 快照来源，用于区分用户写入、AI 写入和系统写入 */
    source: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    /** 如果由 AI 任务生成，则关联对应任务 */
    agentTaskId: v.optional(v.id("agentTasks")),
  })
    .index("by_document_version", ["documentId", "version"])
    .index("by_document", ["documentId"]),

  agentTasks: defineTable({
    /** 任务归属用户 */
    userId: v.string(),
    /** 第一版先只约束最核心任务类型 */
    taskType: v.union(
      v.literal("qa"),
      v.literal("summarize"),
      v.literal("draft"),
      v.literal("update_document"),
    ),
    /** 任务状态流转，为后续编排和评测打底 */
    status: v.union(
      v.literal("queued"),
      v.literal("planning"),
      v.literal("retrieving"),
      v.literal("drafting"),
      v.literal("awaiting_approval"),
      v.literal("applying"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    /** 用户原始意图 */
    userGoal: v.string(),
    /** 如果任务针对某篇文档，则记录目标文档 */
    targetDocumentId: v.optional(v.id("documents")),
    /** 后续用于保存结构化计划 */
    planJson: v.optional(v.string()),
    /** 任务产出摘要 */
    resultSummary: v.optional(v.string()),
    /** 失败原因 */
    errorMessage: v.optional(v.string()),
    /** 创建时间 */
    createdAt: v.number(),
    /** 更新时间 */
    updatedAt: v.number(),
    /** 完成时间 */
    completedAt: v.optional(v.number()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_status", ["status"]),

  knowledgeSyncJobs: defineTable({
    /** 任务归属用户 */
    userId: v.string(),
    /** 需要被索引的文档 ID */
    documentId: v.id("documents"),
    /** 目标版本号，用于增量索引 */
    targetVersion: v.number(),
    /** 同步任务状态 */
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    /** 触发来源 */
    trigger: v.union(
      v.literal("document_create"),
      v.literal("document_update"),
      v.literal("document_delete"),
      v.literal("manual_rebuild"),
    ),
    /** 失败时记录错误信息，便于复盘 */
    errorMessage: v.optional(v.string()),
    /** 开始执行时间 */
    startedAt: v.optional(v.number()),
    /** 结束执行时间 */
    finishedAt: v.optional(v.number()),
    /** 重试次数 */
    attempts: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_document", ["documentId"]),
});