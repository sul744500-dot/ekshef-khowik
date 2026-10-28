import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { RoomManager } from "./roomManager";
import { attachGame } from "./socket";

const root = fileURLToPath(new URL("..", import.meta.url));
const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3100;
const host = process.env.HOST || "0.0.0.0";
const persist = process.env.PERSIST_FILE ?? "data/rooms.json";

/** عناوين الجهاز على الشبكة المحلية، ليشارك صاحب الغرفة رابطًا يفتح من جوالات أصحابه بدل localhost */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254."))
    .map((a) => a!.address);
}

const isLoopback = (addr: string | undefined) => !!addr && (addr === "::1" || addr.startsWith("127.") || addr === "::ffff:127.0.0.1");

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

async function main() {
  const manager = new RoomManager({
    maxPlayersCap: Number(process.env.MAX_PLAYERS) || undefined,
    persistFile: persist === "off" ? null : resolve(root, persist),
  });

  let app: Handler = (_req, res) => {
    res.statusCode = 503;
    res.end("starting");
  };

  const httpServer = createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, rooms: manager.size }));
      return;
    }
    // يجاوب فقط على المتصفح المفتوح على نفس الجهاز، فلا يكشف عناوين الشبكة للزوار
    if (req.url === "/lan-info" && isLoopback(req.socket.remoteAddress)) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ addresses: lanAddresses(), port }));
      return;
    }
    app(req, res);
  });

  const origins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    cors: origins?.length ? { origin: origins } : undefined,
    // اتصالات WebSocket غير Socket.IO (تحديث Vite أثناء التطوير) تُترك لصاحبها
    destroyUpgrade: false,
  });
  attachGame(io, manager);

  if (dev) {
    const { createServer: createVite } = await import("vite");
    const vite = await createVite({
      root,
      appType: "spa",
      server: { middlewareMode: true, hmr: { server: httpServer } },
    });
    app = (req, res) =>
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end();
      });
  } else {
    const { default: sirv } = await import("sirv");
    app = sirv(resolve(root, "dist"), {
      single: true,
      etag: true,
      setHeaders(res, pathname) {
        res.setHeader("Cache-Control", pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
  }

  const shutdown = () => {
    manager.saveNow();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  httpServer.listen(port, host, () => {
    console.log(`> اكشف خويك جاهزة على http://localhost:${port} (${dev ? "تطوير" : "إنتاج"})`);
    for (const ip of lanAddresses()) console.log(`> لأجهزة نفس الشبكة (Wi-Fi): http://${ip}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
