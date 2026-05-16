/**
 * 標準入力からテキストを読み取るユーティリティ。
 */

/**
 * 標準入力から全テキストを読み取る。
 * CLI呼び出し時に使用される。
 *
 * @returns Promise<string> 読み取ったテキスト
 */
export async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = Bun.stdin.stream().getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Uint8Array配列を結合してテキストにデコード
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(combined);
}

/**
 * 標準入力が利用可能かチェックする。
 * パイプやリダイレクトで入力がある場合にtrue。
 */
export function isStdinAvailable(): boolean {
  // Bunではstdin.isTTY()で判定可能
  return !(Bun.stdin as any).isTTY;
}
