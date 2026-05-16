import { unlinkSync } from "node:fs";
import { getSocketPath } from "../shared/paths";
import { encode, FrameDecoder } from "./framing";
import type { IpcRequest, IpcResponse } from "../shared/types";

type CommandHandler = (
  args: Record<string, unknown>
) => Promise<IpcResponse> | IpcResponse;

export class IpcServer {
  private handlers = new Map<string, CommandHandler>();
  private server: ReturnType<typeof Bun.listen> | null = null;
  private socketPath: string;

  public onActivity: () => void = () => {};

  constructor() {
    this.socketPath = getSocketPath();
  }

  registerHandler(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  start(): void {
    try {
      unlinkSync(this.socketPath);
    } catch {
      // 無視。
    }

    /**
     * ソケットごとにFrameDecoderを保持する。
     * Bunのsocketオブジェクトにdataプロパティを付与して管理する。
     */
    this.server = Bun.listen({
      unix: this.socketPath,
      socket: {
        open(socket) {
          (socket as any).decoder = new FrameDecoder();
        },
        data: async (socket, rawData) => {
          this.onActivity();
          const decoder: FrameDecoder = (socket as any).decoder;
          const messages = decoder.feed(rawData.toString());

          for (const msg of messages) {
            const request = msg as IpcRequest;
            const handler = this.handlers.get(request.command);

            if (!handler) {
              socket.write(
                encode({ ok: false, error: `Unknown command: ${request.command}` })
              );
              socket.end();
              return;
            }

            try {
              const response = await handler(request.args);
              socket.write(encode(response));
            } catch (err) {
              socket.write(
                encode({
                  ok: false,
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            }
            socket.end();
          }
        },
        close() {},
        error(_socket, err) {
          console.error("[radiusd] socket error:", err.message);
        },
      },
    });

    console.log(`[radiusd] listening on ${this.socketPath}`);
  }

  stop(): void {
    this.server?.stop(true);
    try {
      unlinkSync(this.socketPath);
    } catch {
      // 無視。
    }
    console.log("[radiusd] stopped");
  }
}
