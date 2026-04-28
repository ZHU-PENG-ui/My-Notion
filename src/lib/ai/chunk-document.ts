import { KnowledgeChunk, NormalizedBlock, NormalizedDocument } from "./types";

type ChunkingOptions = {
  minChunkChars: number;
  softTargetChars: number;
  maxChunkChars: number;
};

const DEFAULT_OPTIONS: ChunkingOptions = {
  minChunkChars: 300,
  softTargetChars: 500,
  maxChunkChars: 800,
};

/**
 * 轻量 token 估算：
 * - 中文通常接近“字数 ~= token 数”
 * - 英文通常需要按词拆分估算
 * 第一版使用统一近似规则，满足阶段三检索控制需求。
 */
export function estimateTokenCount(text: string): number {
  if (!text.trim()) return 0;
  const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) ?? []).length;
  const nonLatinCharCount = text.replace(/[A-Za-z0-9_\s]/g, "").length;
  return latinWordCount + nonLatinCharCount;
}

function createStableHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `chunk_v1_${hash.toString(16)}`;
}

export function hashChunkText(text: string): string {
  return createStableHash(text.trim());
}

function joinBlockTexts(blocks: NormalizedBlock[]): string {
  return blocks.map((block) => block.plainText.trim()).filter(Boolean).join("\n");
}

function countCharsForBlocks(blocks: NormalizedBlock[]): number {
  return joinBlockTexts(blocks).length;
}

function isHeadingBlock(block: NormalizedBlock): boolean {
  return block.type === "heading";
}

type ShouldStartNewChunkParams = {
  currentBlocks: NormalizedBlock[];
  nextBlock: NormalizedBlock;
  options: ChunkingOptions;
};

/**
 * 分块决策函数：
 * 1. 现有 chunk 太长时强制切分
 * 2. 碰到新 heading 且当前 chunk 已达到最小长度时切分
 * 3. headingTrail 变化且当前 chunk 已超过 soft target 时切分
 */
export function shouldStartNewChunk(params: ShouldStartNewChunkParams): boolean {
  const { currentBlocks, nextBlock, options } = params;
  if (currentBlocks.length === 0) return false;

  const currentChars = countCharsForBlocks(currentBlocks);
  if (currentChars >= options.maxChunkChars) return true;

  const firstHeadingTrail = currentBlocks[0].headingTrail.join(" > ");
  const nextHeadingTrail = nextBlock.headingTrail.join(" > ");
  const headingTrailChanged = firstHeadingTrail !== nextHeadingTrail;

  if (isHeadingBlock(nextBlock) && currentChars >= options.minChunkChars) return true;
  if (headingTrailChanged && currentChars >= options.softTargetChars) return true;

  return false;
}

type BuildChunkParams = {
  doc: NormalizedDocument;
  chunkIndex: number;
  blocks: NormalizedBlock[];
};

export function buildChunkFromBlocks(params: BuildChunkParams): KnowledgeChunk {
  const { doc, chunkIndex, blocks } = params;
  const text = joinBlockTexts(blocks);
  const headingTrail = blocks[0]?.headingTrail ?? [];

  return {
    chunkId: `${doc.documentId}_v${doc.version}_${chunkIndex + 1}`,
    documentId: doc.documentId,
    version: doc.version,
    blockIds: blocks.map((block) => block.blockId),
    pathTitles: doc.pathTitles,
    headingTrail,
    text,
    tokenCount: estimateTokenCount(text),
    textHash: hashChunkText(text),
  };
}

function flushChunkIfNeeded(
  doc: NormalizedDocument,
  chunks: KnowledgeChunk[],
  currentBlocks: NormalizedBlock[],
) {
  if (currentBlocks.length === 0) return;
  chunks.push(
    buildChunkFromBlocks({
      doc,
      chunkIndex: chunks.length,
      blocks: currentBlocks,
    }),
  );
}

function splitTextByMaxChars(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const segments: string[] = [];

  let cursor = 0;
  while (cursor < text.length) {
    segments.push(text.slice(cursor, cursor + maxChars).trim());
    cursor += maxChars;
  }

  return segments.filter((segment) => segment.length > 0);
}

/**
 * 阶段三核心入口：把规范化文档切成可检索 chunk。
 */
export function chunkNormalizedDocument(
  doc: NormalizedDocument,
  options: Partial<ChunkingOptions> = {},
): KnowledgeChunk[] {
  const finalOptions = { ...DEFAULT_OPTIONS, ...options };
  const chunks: KnowledgeChunk[] = [];
  let currentBlocks: NormalizedBlock[] = [];

  for (const block of doc.blocks) {
    // 单块超长兜底：当一个 block 本身远大于 max 时，按长度切成多个子 chunk。
    // 这样可以避免“只有一个超长段落却永远只产出一个 chunk”的问题。
    if (
      currentBlocks.length === 0 &&
      block.plainText.length > finalOptions.maxChunkChars
    ) {
      const segments = splitTextByMaxChars(block.plainText, finalOptions.maxChunkChars);

      for (const segment of segments) {
        chunks.push({
          chunkId: `${doc.documentId}_v${doc.version}_${chunks.length + 1}`,
          documentId: doc.documentId,
          version: doc.version,
          blockIds: [block.blockId],
          pathTitles: doc.pathTitles,
          headingTrail: block.headingTrail,
          text: segment,
          tokenCount: estimateTokenCount(segment),
          textHash: hashChunkText(segment),
        });
      }

      continue;
    }

    const shouldSplit = shouldStartNewChunk({
      currentBlocks,
      nextBlock: block,
      options: finalOptions,
    });

    if (shouldSplit) {
      flushChunkIfNeeded(doc, chunks, currentBlocks);
      currentBlocks = [];
    }

    currentBlocks.push(block);

    // 超长兜底：加入后如果超过 max，立即落盘，避免单 chunk 无限膨胀。
    if (countCharsForBlocks(currentBlocks) >= finalOptions.maxChunkChars) {
      flushChunkIfNeeded(doc, chunks, currentBlocks);
      currentBlocks = [];
    }
  }

  flushChunkIfNeeded(doc, chunks, currentBlocks);
  return chunks;
}
