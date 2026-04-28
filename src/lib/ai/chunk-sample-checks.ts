import { chunkNormalizedDocument } from "./chunk-document";
import { normalizeDocument } from "./normalize-blocknote";

type SampleCheckResult = {
  name: string;
  passed: boolean;
  details?: string;
};

type ChunkingSampleReport = {
  total: number;
  passed: number;
  failed: number;
  results: SampleCheckResult[];
};

function makeParagraph(id: string, text: string) {
  return {
    id,
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function makeHeading(id: string, text: string, level: number) {
  return {
    id,
    type: "heading",
    props: { level },
    content: [{ type: "text", text }],
  };
}

/**
 * 阶段三最小样本检查。
 * 目标：验证切片规则是否可用、可回溯、可重复。
 */
export function runChunkingSampleChecks(): ChunkingSampleReport {
  const results: SampleCheckResult[] = [];

  // Case 1: 短文档应至少产出 1 个 chunk
  const shortDoc = normalizeDocument({
    documentId: "d-short",
    title: "短文档",
    version: 1,
    content: JSON.stringify([makeParagraph("p1", "这是一段短文本。")]),
  });
  const shortChunks = chunkNormalizedDocument(shortDoc);
  results.push({
    name: "short-doc-has-chunk",
    passed: shortChunks.length === 1,
    details: `chunks=${shortChunks.length}`,
  });

  // Case 2: 标题变化时应有分段机会（配合较小阈值便于样本触发）
  const headingDoc = normalizeDocument({
    documentId: "d-heading",
    title: "标题切分",
    version: 1,
    content: JSON.stringify([
      makeHeading("h1", "背景", 1),
      makeParagraph("p1", "背景内容背景内容背景内容背景内容背景内容背景内容背景内容。"),
      makeHeading("h2", "目标", 1),
      makeParagraph("p2", "目标内容目标内容目标内容目标内容目标内容目标内容目标内容。"),
    ]),
  });
  const headingChunks = chunkNormalizedDocument(headingDoc, {
    minChunkChars: 20,
    softTargetChars: 30,
    maxChunkChars: 60,
  });
  results.push({
    name: "heading-change-can-split",
    passed: headingChunks.length >= 2,
    details: `chunks=${headingChunks.length}`,
  });

  // Case 3: 每个 chunk 都必须有 block 回溯
  const allTraceable = headingChunks.every((chunk) => chunk.blockIds.length > 0);
  results.push({
    name: "chunk-block-traceability",
    passed: allTraceable,
    details: allTraceable ? "all chunks traceable" : "missing blockIds",
  });

  // Case 4: 过长文本应被切分（降低 max 方便触发）
  const longDoc = normalizeDocument({
    documentId: "d-long",
    title: "长文档",
    version: 1,
    content: JSON.stringify([
      makeParagraph(
        "p1",
        "这是一个很长很长的段落".repeat(40),
      ),
    ]),
  });
  const longChunks = chunkNormalizedDocument(longDoc, {
    minChunkChars: 20,
    softTargetChars: 40,
    maxChunkChars: 80,
  });
  results.push({
    name: "long-text-splits",
    passed: longChunks.length >= 2,
    details: `chunks=${longChunks.length}`,
  });

  // Case 5: chunk 文本哈希应稳定（同输入两次结果相同）
  const runA = chunkNormalizedDocument(headingDoc, {
    minChunkChars: 20,
    softTargetChars: 30,
    maxChunkChars: 60,
  });
  const runB = chunkNormalizedDocument(headingDoc, {
    minChunkChars: 20,
    softTargetChars: 30,
    maxChunkChars: 60,
  });
  const stableHashes =
    runA.length === runB.length &&
    runA.every((chunk, idx) => chunk.textHash === runB[idx].textHash);
  results.push({
    name: "chunk-hash-stability",
    passed: stableHashes,
    details: stableHashes ? "stable" : "hash mismatch",
  });

  const passed = results.filter((item) => item.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
