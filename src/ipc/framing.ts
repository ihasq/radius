/**
 * ndjson（改行区切りJSON）によるメッセージフレーミング。
 *
 * プロトコル仕様:
 *   - 1メッセージ = 1行のJSON + "\n"
 *   - 受信側はバッファに蓄積し、"\n" を検出した時点でパースする。
 */

/**
 * オブジェクトをndjsonフレームにエンコードする。
 */
export function encode(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

/**
 * ストリームバッファから完全なメッセージを抽出するステートマシン。
 * ソケット1本につき1インスタンスを生成する。
 */
export class FrameDecoder {
  private buffer = "";

  /**
   * 受信データをバッファに追加し、完全なメッセージがあれば返す。
   * 1回の呼び出しで複数メッセージが返る場合がある。
   */
  feed(chunk: string): unknown[] {
    this.buffer += chunk;
    const messages: unknown[] = [];
    let newlineIdx: number;

    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (line.length === 0) continue;
      try {
        messages.push(JSON.parse(line));
      } catch {
        // 不正な行は破棄する。ログ出力はサーバ側で行う。
      }
    }
    return messages;
  }
}
