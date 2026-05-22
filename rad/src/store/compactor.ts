import type { Operation } from '../types';
import type { RadStore } from './interface';

/**
 * 操作ログからファイルスナップショットを再構築する。
 * 同一領域への複数 write は最新のみ反映。
 * 適用済みログは削除される。
 */
export async function compactStore(store: RadStore): Promise<void> {
  const allOps = await store.getAllOps();
  if (allOps.length === 0) return;

  // ファイルごとに最新の write 操作を収集
  const latestByFile = new Map<string, Operation>();
  for (const op of allOps) {
    if (op.type === 'write') {
      // regionId からファイルパスを抽出（規約: regionId = filePath:startLine-endLine）
      const filePath = extractFilePath(op.regionId);
      const existing = latestByFile.get(filePath);
      if (!existing || op.timestamp > existing.timestamp) {
        latestByFile.set(filePath, op);
      }
    }
  }

  // スナップショットを保存
  for (const [filePath, op] of latestByFile) {
    await store.putSnapshot(filePath, op.content);
  }

  // 適用済みログを削除
  await store.clearOps();
}

function extractFilePath(regionId: string): string {
  // regionId 形式: "filePath:startLine-endLine" または "filePath"
  const colonIdx = regionId.lastIndexOf(':');
  if (colonIdx === -1 || colonIdx === regionId.length - 1) return regionId;
  const afterColon = regionId.slice(colonIdx + 1);
  if (/^\d+-\d+$/.test(afterColon)) return regionId.slice(0, colonIdx);
  return regionId;
}
