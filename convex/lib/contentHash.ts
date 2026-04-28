/**
 * 共享内容哈希工具。
 *
 * 用途：
 * - 给文档版本体系提供稳定内容指纹
 * - 减少重复写同类哈希逻辑导致的不一致风险
 *
 * 说明：
 * 当前是轻量 hash，适合作为第一阶段一致性保障。
 * 后续若需要更强抗碰撞能力，可升级为 sha256 并统一替换此模块。
 */
export function createContentHash(content: string): string {
  let hash = 0;

  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0;
  }

  return `v1_${hash.toString(16)}`;
}
