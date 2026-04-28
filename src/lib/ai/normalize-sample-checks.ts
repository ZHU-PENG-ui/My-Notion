import {
  normalizeBlocks,
  normalizeDocument,
  safeParseBlockNoteContent,
} from "./normalize-blocknote";

type SampleCheckResult = {
  name: string;
  passed: boolean;
  details?: string;
};

type NormalizationSampleReport = {
  total: number;
  passed: number;
  failed: number;
  results: SampleCheckResult[];
};

function makeParagraphBlock(id: string, text: string) {
  return {
    id,
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function makeHeadingBlock(id: string, text: string, level: number) {
  return {
    id,
    type: "heading",
    props: { level },
    content: [{ type: "text", text }],
  };
}

/**
 * 阶段二样本检查脚本（纯函数版）。
 *
 * 用法：
 * - 在后续测试框架里直接调用 `runNormalizationSampleChecks()`
 * - 或在任意临时调试入口中调用并打印 report
 *
 * 目的：
 * - 把“文档中的目标指标”转成可重复执行的最小样本检查。
 */
export function runNormalizationSampleChecks(): NormalizationSampleReport {
  const results: SampleCheckResult[] = [];

  // Case 1: 空内容安全解析
  try {
    const parsed = safeParseBlockNoteContent("");
    results.push({
      name: "safeParse-empty-content",
      passed: Array.isArray(parsed) && parsed.length === 0,
      details: `parsed length=${parsed.length}`,
    });
  } catch (error) {
    results.push({
      name: "safeParse-empty-content",
      passed: false,
      details: String(error),
    });
  }

  // Case 2: 非法 JSON 应抛错
  try {
    safeParseBlockNoteContent("{invalid");
    results.push({
      name: "safeParse-invalid-json-throws",
      passed: false,
      details: "expected throw but did not throw",
    });
  } catch {
    results.push({
      name: "safeParse-invalid-json-throws",
      passed: true,
    });
  }

  // Case 3: 标题路径构建
  const headingBlocks = [
    makeHeadingBlock("h1", "项目背景", 1),
    makeHeadingBlock("h2", "目标", 2),
    makeParagraphBlock("p1", "这里是目标描述"),
  ];
  const normalizedHeadingBlocks = normalizeBlocks(headingBlocks);
  const paragraph = normalizedHeadingBlocks.find((block) => block.blockId === "p1");
  results.push({
    name: "heading-trail-build",
    passed: !!paragraph && paragraph.headingTrail.join(" > ") === "项目背景 > 目标",
    details: paragraph ? paragraph.headingTrail.join(" > ") : "paragraph missing",
  });

  // Case 4: 占位文本降级（image/file/link）
  const mixedBlocks = [
    { id: "img1", type: "image" },
    { id: "file1", type: "file" },
    { id: "link1", type: "link", props: { href: "https://example.com" } },
  ];
  const normalizedMixedBlocks = normalizeBlocks(mixedBlocks);
  const placeholders = normalizedMixedBlocks.map((block) => block.plainText);
  results.push({
    name: "placeholder-fallback",
    passed:
      placeholders.includes("[image]") &&
      placeholders.includes("[file]") &&
      placeholders.includes("[link:https://example.com]"),
    details: placeholders.join(", "),
  });

  // Case 5: 同内容哈希稳定
  const sampleDocContent = JSON.stringify([
    makeHeadingBlock("h1", "规范化测试", 1),
    makeParagraphBlock("p1", "相同内容应该得到相同哈希"),
  ]);
  const docA = normalizeDocument({
    documentId: "doc-1",
    title: "Doc A",
    version: 1,
    pathTitles: ["工作台", "AI"],
    content: sampleDocContent,
  });
  const docB = normalizeDocument({
    documentId: "doc-1",
    title: "Doc A",
    version: 1,
    pathTitles: ["工作台", "AI"],
    content: sampleDocContent,
  });
  results.push({
    name: "content-hash-stability",
    passed: docA.contentHash === docB.contentHash,
    details: `${docA.contentHash} vs ${docB.contentHash}`,
  });

  const passed = results.filter((item) => item.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
