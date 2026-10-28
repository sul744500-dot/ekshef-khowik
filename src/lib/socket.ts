import { io, type Socket } from "socket.io-client";
import type { AckResult } from "../../shared/types";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 10000,
    });
  }
  return socket;
}

/** يرسل طلبًا للخادم وينتظر الرد، ويحوّل انقطاع الاتصال لخطأ مفهوم بدل التعليق */
export function request<T = object>(event: string, payload: object = {}, timeoutMs = 8000): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    getSocket()
      .timeout(timeoutMs)
      .emit(event, payload, (err: Error | null, res: AckResult<T>) => {
        if (err) resolve({ ok: false, error: "no-connection" });
        else resolve(res);
      });
  });
}
