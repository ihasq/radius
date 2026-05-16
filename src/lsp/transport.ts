/**
 * LSP (Language Server Protocol) のメッセージフレーミング。
 *
 * 送信: Content-Length: <byte length>\r\n\r\n<JSON>
 * 受信: ストリームからヘッダを解析し、Content-Lengthバイト分のボディを読み取る。
 */

import type { Subprocess } from "bun";

/**
 * LSPメッセージをエンコードしてプロセスのstdinに書き込む。
 * Bunの Subprocess.stdin は FileSink 型であり、write() を直接呼び出す。
 */
export function writeMessage(proc: { stdin: { write(data: string | Uint8Array): number; flush?(): void } }, message: object): void {
  const json = JSON.stringify(message);
  const byteLength = Buffer.byteLength(json, "utf-8");
  const frame = `Content-Length: ${byteLength}\r\n\r\n${json}`;
  proc.stdin.write(frame);
  if (proc.stdin.flush) proc.stdin.flush();
}

/**
 * LSPメッセージの読み取り器。
 * プロセスのstdoutからContent-Lengthフレームを逐次的に読み取る。
 */
export class LspReader {
  private buffer = Buffer.alloc(0);
  private reader: ReadableStreamDefaultReader<Uint8Array>;

  constructor(stdout: ReadableStream<Uint8Array>) {
    this.reader = stdout.getReader();
  }

  /**
   * 次のLSPメッセージを読み取って返す。
   * ストリームが終了した場合はnullを返す。
   */
  async read(): Promise<object | null> {
    while (true) {
      // ヘッダ終端 "\r\n\r\n" を探す。
      const headerEnd = this.findHeaderEnd();
      if (headerEnd !== -1) {
        const headerStr = this.buffer.subarray(0, headerEnd).toString("utf-8");
        const match = headerStr.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          // 不正なヘッダ。スキップする。
          this.buffer = this.buffer.subarray(headerEnd + 4);
          continue;
        }

        const contentLength = parseInt(match[1], 10);
        const bodyStart = headerEnd + 4;
        const totalNeeded = bodyStart + contentLength;

        // ボディが揃うまでバッファを充填する。
        while (this.buffer.length < totalNeeded) {
          const ok = await this.fillBuffer();
          if (!ok) return null;
        }

        const body = this.buffer.subarray(bodyStart, totalNeeded).toString("utf-8");
        this.buffer = this.buffer.subarray(totalNeeded);

        try {
          return JSON.parse(body);
        } catch {
          continue;
        }
      }

      // ヘッダ終端が見つからない。バッファを充填する。
      const ok = await this.fillBuffer();
      if (!ok) return null;
    }
  }

  private findHeaderEnd(): number {
    const marker = Buffer.from("\r\n\r\n");
    const idx = this.buffer.indexOf(marker);
    return idx;
  }

  private async fillBuffer(): Promise<boolean> {
    const { value, done } = await this.reader.read();
    if (done || !value) return false;
    this.buffer = Buffer.concat([this.buffer, Buffer.from(value)]);
    return true;
  }
}
