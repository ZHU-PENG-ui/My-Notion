/**
 * 文档版本快照相关方法。
 *
 * 这个模块刻意和 `documents.ts` 分离，避免把 AI、版本控制、审计逻辑
 * 侵入到当前稳定的文档 CRUD 主链路里。第一阶段先提供最小可用能力：
 * 创建版本、查询最新版本、按文档列出版本。
 */
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { createContentHash } from "./lib/contentHash";

/**
 * 创建新的文档版本快照。
 *
 * 约束：
 * 1. 只允许文档所有者创建版本
 * 2. 版本号在单文档内递增
 * 3. 写入版本后同步回写主文档上的 latestVersion / contentHash
 */
export const createVersion = mutation({
  args: {
    documentId: v.id("documents"),
    content: v.string(),
    source: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
    agentTaskId: v.optional(v.id("agentTasks")),
  },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const document = await context.db.get(args.documentId);
    if (!document || document.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const latestVersionRecord = await context.db
      .query("documentVersions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .first();

    const nextVersion = (latestVersionRecord?.version ?? 0) + 1;
    const contentHash = createContentHash(args.content);
    const now = Date.now();

    const versionId = await context.db.insert("documentVersions", {
      documentId: args.documentId,
      version: nextVersion,
      content: args.content,
      contentHash,
      createdAt: now,
      createdBy: identity.subject,
      source: args.source,
      agentTaskId: args.agentTaskId,
    });

    await context.db.patch(args.documentId, {
      latestVersion: nextVersion,
      contentHash,
      indexStatus: "pending",
      lastEditedTime: now,
    });

    return {
      versionId,
      version: nextVersion,
      contentHash,
    };
  },
});

/**
 * 获取某篇文档的最新版本摘要。
 *
 * 这个接口优先返回版本体系里的最新记录，便于后续 patch 乐观锁和
 * 索引任务直接读取，不需要扫描全文历史。
 */
export const getLatestVersionByDocumentId = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const document = await context.db.get(args.documentId);
    if (!document || document.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const latestVersionRecord = await context.db
      .query("documentVersions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .first();

    return latestVersionRecord
      ? {
          version: latestVersionRecord.version,
          contentHash: latestVersionRecord.contentHash,
          createdAt: latestVersionRecord.createdAt,
          createdBy: latestVersionRecord.createdBy,
          source: latestVersionRecord.source,
        }
      : null;
  },
});

/**
 * 列出某篇文档的版本历史。
 *
 * 第一版主要用于调试和人工验收，默认按新到旧返回，避免未来排查冲突时
 * 还要再补一个临时接口。
 */
export const listVersionsByDocumentId = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const document = await context.db.get(args.documentId);
    if (!document || document.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return await context.db
      .query("documentVersions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .collect();
  },
});
