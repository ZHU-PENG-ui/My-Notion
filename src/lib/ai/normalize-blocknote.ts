import { NormalizedBlock, NormalizedDocument } from "./types";

/**
 * BlockNote 结构化规范化模块。
 *
 * 为什么需要这一层：
 * - 编辑器输出是富文本 JSON，直接检索会带来噪音和结构不稳定。
 * - normalize 后得到稳定中间层，可直接供 chunk/retrieval 使用。
 *
 * 不负责的事情：
 * - 不做向量化
 * - 不做检索
 * - 不做写回 patch
 */

type UnknownRecord = Record<string, unknown>;

const SUPPORTED_TEXTUAL_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
]);

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 轻量稳定哈希，避免引入额外运行时依赖。
 * 后续如需更强一致性，可替换为 sha256。
 */
function createStableHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `norm_v1_${hash.toString(16)}`;
}

/**
 * 安全解析 BlockNote JSON。
 * - 空内容返回空数组
 * - 非法 JSON 抛出可读错误，便于上层记录失败原因
 */
export function safeParseBlockNoteContent(content?: string): unknown[] {
  if (!content || !content.trim()) return [];

  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(
      `Invalid BlockNote JSON content: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
    );
  }
}

function extractInlineText(inlineContent: unknown): string {
  if (!Array.isArray(inlineContent)) return "";

  const pieces: string[] = [];
  for (const node of inlineContent) {
    const record = toRecord(node);
    if (!record) continue;
    const text = toStringValue(record.text);
    if (isNonEmptyString(text)) pieces.push(text.trim());
  }

  return pieces.join(" ").trim();
}

/**
 * 提取单个 block 的纯文本。
 * 支持主流文本块，图片/文件/链接以占位形式保留语义。
 */
export function extractPlainTextFromBlock(block: unknown): string {
  const record = toRecord(block);
  if (!record) return "";

  const type = toStringValue(record.type) ?? "unknown";
  const props = toRecord(record.props);
  const content = record.content;

  if (SUPPORTED_TEXTUAL_TYPES.has(type)) {
    // BlockNote 常见结构：content 是 inline 节点数组
    const inlineText = extractInlineText(content);
    if (inlineText) return inlineText;

    // 兼容部分 block 把文本放在 props.text
    const propText = props ? toStringValue(props.text) : undefined;
    return propText?.trim() ?? "";
  }

  if (type === "image") return "[image]";
  if (type === "file") return "[file]";

  if (type === "link") {
    const linkText = props ? toStringValue(props.text) : undefined;
    const href = props ? toStringValue(props.href) : undefined;
    if (isNonEmptyString(linkText)) return `[link:${linkText.trim()}]`;
    if (isNonEmptyString(href)) return `[link:${href.trim()}]`;
    return "[link]";
  }

  return "";
}

export function extractBlockType(block: unknown): string {
  const record = toRecord(block);
  return (record && toStringValue(record.type)) || "unknown";
}

function getHeadingLevel(block: unknown): number | null {
  const record = toRecord(block);
  if (!record) return null;
  if (toStringValue(record.type) !== "heading") return null;

  const props = toRecord(record.props);
  const level = props?.level;
  return typeof level === "number" ? level : null;
}

/**
 * 基于当前块之前出现的标题，构建 heading trail。
 */
export function buildHeadingTrail(blocks: unknown[], currentIndex: number): string[] {
  const trailByLevel: string[] = [];

  for (let i = 0; i <= currentIndex; i += 1) {
    const block = blocks[i];
    const level = getHeadingLevel(block);
    if (level === null) continue;

    const headingText = extractPlainTextFromBlock(block);
    if (!headingText) continue;

    const normalizedLevel = Math.max(1, Math.min(6, level));
    trailByLevel[normalizedLevel - 1] = headingText;

    // 低级标题出现时，清理其下级标题，防止路径污染
    for (let j = normalizedLevel; j < trailByLevel.length; j += 1) {
      trailByLevel[j] = "";
    }
  }

  return trailByLevel.filter((item) => isNonEmptyString(item));
}

function resolveBlockId(block: unknown, position: number): string {
  const record = toRecord(block);
  const directId = record ? toStringValue(record.id) : undefined;
  if (isNonEmptyString(directId)) return directId.trim();
  return `generated_block_${position}`;
}

/**
 * 把原始 block 数组规范化成可索引块列表。
 */
export function normalizeBlocks(blocks: unknown[]): NormalizedBlock[] {
  const normalized: NormalizedBlock[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const type = extractBlockType(block);
    const plainText = extractPlainTextFromBlock(block).trim();

    // 空白块不进入检索中间层，减少噪音
    if (!plainText) continue;

    normalized.push({
      blockId: resolveBlockId(block, i),
      type,
      position: i,
      headingTrail: buildHeadingTrail(blocks, i),
      plainText,
      attributes: {
        textualType: SUPPORTED_TEXTUAL_TYPES.has(type),
      },
    });
  }

  return normalized;
}

type NormalizeDocumentParams = {
  documentId: string;
  title: string;
  pathTitles?: string[];
  version: number;
  content?: string;
};

/**
 * 规范化整篇文档。
 */
export function normalizeDocument(params: NormalizeDocumentParams): NormalizedDocument {
  const blocks = safeParseBlockNoteContent(params.content);
  const normalizedBlocks = normalizeBlocks(blocks);

  // 哈希基于“规范化后的核心内容”，而不是原始 JSON 字符串，保证稳定性更好。
  const hashSource = JSON.stringify({
    title: params.title,
    pathTitles: params.pathTitles ?? [],
    version: params.version,
    blocks: normalizedBlocks.map((block) => ({
      blockId: block.blockId,
      type: block.type,
      position: block.position,
      headingTrail: block.headingTrail,
      plainText: block.plainText,
    })),
  });

  return {
    documentId: params.documentId,
    title: params.title,
    pathTitles: params.pathTitles ?? [],
    version: params.version,
    contentHash: createStableHash(hashSource),
    blocks: normalizedBlocks,
  };
}
