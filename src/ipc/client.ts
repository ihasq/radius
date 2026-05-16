import { getSocketPath } from "../shared/paths";
import { encode, FrameDecoder } from "./framing";
import type { IpcRequest, IpcResponse } from "../shared/types";

/** デフォルトのリクエストタイムアウト（ミリ秒）。 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * デーモンにリクエストを送信し、レスポンスを返す。
 * 接続失敗時はnullを返す。タイムアウト時はエラーレスポンスを返す。
 */
export async function sendRequest(
  request: IpcRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<IpcResponse | null> {
  const socketPath = getSocketPath();

  return new Promise<IpcResponse | null>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (value: IpcResponse | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    // --- タイムアウト（A3修正） ---
    timer = setTimeout(() => {
      settle({ ok: false, error: "Request timed out" });
    }, timeoutMs);

    const decoder = new FrameDecoder();

    try {
      Bun.connect({
        unix: socketPath,
        socket: {
          data(_socket, rawData) {
            const messages = decoder.feed(rawData.toString());
            if (messages.length > 0) {
              settle(messages[0] as IpcResponse);
            }
          },
          open(socket) {
            socket.write(encode(request));
          },
          // --- A2修正: close時にPromiseを解決する ---
          close() {
            settle(null);
          },
          connectError() {
            settle(null);
          },
          error(_socket, err) {
            settle({ ok: false, error: err.message });
          },
        },
      });
    } catch {
      settle(null);
    }
  });
}
