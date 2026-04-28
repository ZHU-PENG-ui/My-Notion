/**
 * AI 数据中间层类型定义（阶段二：文档规范化）。
 *
 * 设计目标：
 * 1. 让 BlockNote 原始 JSON 先变成稳定、可检索、可追踪的结构。
 * 2. 为后续 chunk/retrieval/patch 提供统一输入，避免各模块重复解析。
 * 3. 类型先行，确保后续实现时输入输出边界清晰。
 */

export type NormalizedBlock = {
  /** 稳定块 ID（来自原始 block id，缺失时回退生成） */
  blockId: string;
  /** 块类型，如 paragraph / heading / bulletListItem */
  type: string;
  /** 在文档中的顺序位置（从 0 开始） */
  position: number;
  /** 当前块所属标题路径（用于语义分组） */
  headingTrail: string[];
  /** 面向检索的纯文本内容 */
  plainText: string;
  /** 轻量扩展属性，保留少量调试或后续扩展信息 */
  attributes?: Record<string, unknown>;
};

export type NormalizedDocument = {
  documentId: string;
  title: string;
  pathTitles: string[];
  version: number;
  /** 基于规范化结果生成，保证内容语义一致时哈希稳定 */
  contentHash: string;
  blocks: NormalizedBlock[];
};

export type KnowledgeChunk = {
  /** 建议采用“文档 + 版本 + 序号”的稳定格式 */
  chunkId: string;
  documentId: string;
  version: number;
  /** 该 chunk 覆盖到的源块 ID，用于引用和 patch 回溯 */
  blockIds: string[];
  pathTitles: string[];
  headingTrail: string[];
  /** 面向检索的文本主体 */
  text: string;
  /** 轻量 token 估算，用于后续控制召回与上下文长度 */
  tokenCount: number;
  /** chunk 文本哈希，用于去重和增量重建 */
  textHash: string;
};
