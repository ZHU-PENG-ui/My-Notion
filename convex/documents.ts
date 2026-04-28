/**
 * 文档相关操作方法
 */
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { createContentHash } from "./lib/contentHash";

/**
 * 归档文档（递归归档子文档）
 */
export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const existingDocument = await context.db.get(args.id);

    if (!existingDocument || existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const recursiveArchive = async (documentId: Id<"documents">) => {
      const children = await context.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId),
        )
        .collect();

      for (const child of children) {
        await context.db.patch(child._id, { isArchived: true });
        await recursiveArchive(child._id);
      }
    };

    await context.db.patch(args.id, { isArchived: true });
    recursiveArchive(args.id);
  },
});

/**
 * 获取侧边栏文档列表
 */
export const getSidebar = query({
  args: { parentDocument: v.optional(v.id("documents")) },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    return await context.db
      .query("documents")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", userId).eq("parentDocument", args.parentDocument),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();
  },
});

/**
 * 获取收藏的文档列表
 */
export const getStarred = query({
  args: {},
  handler: async (context) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    return await context.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("isArchived"), false),
          q.eq(q.field("isStarred"), true),
        ),
      )
      .order("desc")
      .collect();
  },
});

/**
 * 创建新文档
 */
export const create = mutation({
  args: {
    title: v.string(),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const now = Date.now();
    const initialContent = "[]";
    const initialContentHash = createContentHash(initialContent);

    const documentId = await context.db.insert("documents", {
      title: args.title,
      parentDocument: args.parentDocument,
      userId,
      isArchived: false,
      isPublished: false,
      isStarred: false,
      // 创建即初始化为空文档，确保主表内容与版本快照一致。
      content: initialContent,
      lastEditedTime: now,
      // 版本语义从文档创建时就生效，避免“主表版本号存在但版本表无首条记录”。
      latestVersion: 1,
      contentHash: initialContentHash,
      indexStatus: "pending",
    });

    await context.db.insert("documentVersions", {
      documentId,
      version: 1,
      content: initialContent,
      contentHash: initialContentHash,
      createdAt: now,
      createdBy: userId,
      source: "system",
    });

    return documentId;
  },
});

/**
 * 获取回收站文档列表
 */
export const getTrash = query({
  handler: async (context) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    return await context.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), true))
      .order("desc")
      .collect();
  },
});

/**
 * 恢复文档
 */
export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const existingDocument = await context.db.get(args.id);

    if (!existingDocument || existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const recursiveRestore = async (documentId: Id<"documents">) => {
      const children = await context.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId),
        )
        .collect();

      for (const child of children) {
        await context.db.patch(child._id, { isArchived: false });
        await recursiveRestore(child._id);
      }
    };

    const options: Partial<Doc<"documents">> = { isArchived: false };

    if (existingDocument.parentDocument) {
      const parent = await context.db.get(existingDocument.parentDocument);
      if (parent?.isArchived) options.parentDocument = undefined;
    }

    await context.db.patch(args.id, options);
    recursiveRestore(args.id);
  },
});

/**
 * 删除文档
 */
export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const existingDocument = await context.db.get(args.id);

    if (!existingDocument || existingDocument.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return await context.db.delete(args.id);
  },
});

/**
 * 批量删除文档
 */
export const batchRemove = mutation({
  args: { ids: v.array(v.id("documents")) },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    let deletedCount = 0;

    for (const id of args.ids) {
      const existingDocument = await context.db.get(id);
      if (existingDocument && existingDocument.userId === userId) {
        await context.db.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  },
});

/**
 * 获取搜索文档列表
 */
export const getSearch = query({
  handler: async (context) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    return await context.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();
  },
});

/**
 * 根据ID获取文档
 */
export const getById = query({
  args: { documentId: v.id("documents") },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    const document = await context.db.get(args.documentId);

    if (!document) throw new Error("Not found");
    if (document.isPublished && !document.isArchived) return document;
    if (!identity) throw new Error("Not authenticated");

    if (document.userId !== identity.subject) throw new Error("Unauthorized");
    return document;
  },
});

/**
 * 更新文档信息
 */
export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
    isStarred: v.optional(v.boolean()),
  },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { id, ...rest } = args;
    const existingDocument = await context.db.get(id);

    if (!existingDocument || existingDocument.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return await context.db.patch(id, {
      ...rest,
      // 文档有变更就将索引状态置为 pending，索引任务由后续独立链路处理。
      indexStatus: "pending",
      lastEditedTime: Date.now(),
    });
  },
});

/**
 * 移除文档图标
 */
export const removeIcon = mutation({
  args: { id: v.id("documents") },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const existingDocument = await context.db.get(args.id);
    if (!existingDocument || existingDocument.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return await context.db.patch(args.id, { icon: undefined });
  },
});

/**
 * 移除文档封面图片
 */
export const removeCoverImage = mutation({
  args: { id: v.id("documents") },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const existingDocument = await context.db.get(args.id);
    if (!existingDocument || existingDocument.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return await context.db.patch(args.id, { coverImage: undefined });
  },
});

/**
 * 移动文档
 */
export const move = mutation({
  args: {
    id: v.id("documents"),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const existingDocument = await context.db.get(args.id);
    if (!existingDocument || existingDocument.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    if (args.parentDocument) {
      let currentParent: Id<"documents"> | undefined = args.parentDocument;
      while (currentParent) {
        const parentDoc: Doc<"documents"> | null = await context.db.get(currentParent);
        if (!parentDoc) break;
        if (parentDoc._id === args.id) throw new Error("Cannot move document into its own subtree");
        currentParent = parentDoc.parentDocument;
      }
    }

    return await context.db.patch(args.id, { parentDocument: args.parentDocument });
  },
});

/**
 * 获取文档路径
 */
export const getDocumentPath = query({
  args: { documentId: v.id("documents") },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const path: Doc<"documents">[] = [];
    let currentDocument: Doc<"documents"> | null | undefined = await context.db.get(args.documentId);

    if (!currentDocument || currentDocument.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    while (currentDocument) {
      path.unshift(currentDocument);
      currentDocument = currentDocument.parentDocument
        ? await context.db.get(currentDocument.parentDocument)
        : null;
    }
    return path;
  },
});

/**
 * 切换文档收藏状态
 */
export const toggleStar = mutation({
  args: { id: v.id("documents"), isStarred: v.boolean() },
  handler: async (context, args) => {
    const identity = await context.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existingDocument = await context.db.get(args.id);
    if (!existingDocument || existingDocument.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return await context.db.patch(args.id, {
      isStarred: args.isStarred,
      lastEditedTime: Date.now(),
    });
  },
});