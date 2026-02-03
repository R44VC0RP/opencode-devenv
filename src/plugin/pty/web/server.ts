/**
 * Web server for PTY session management.
 * Provides HTTP API and WebSocket connections for real-time terminal streaming.
 */

import type { ServerWebSocket } from "bun";
import { ptyManager } from "../manager.ts";
import { emitter } from "../emitter.ts";
import { createLogger } from "../../logger.ts";
import { DASHBOARD_HTML } from "./static/index.ts";

const log = createLogger("web-server");

interface WebSocketData {
  sessionId: string;
  unsubOutput?: () => void;
  unsubState?: () => void;
}

type WSMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "history"; offset?: number; limit?: number };

let activeServer: ReturnType<typeof Bun.serve> | null = null;

export function startWebServer(port: number = 7681): ReturnType<typeof Bun.serve> {
  if (activeServer) {
    log.warn("web server already running", { port: activeServer.port });
    return activeServer;
  }

  log.info("starting web server", { port });

  activeServer = Bun.serve<WebSocketData>({
    port,
    hostname: "localhost",

    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        const sessionId = url.searchParams.get("session");
        if (!sessionId) {
          return new Response("Missing session parameter", { status: 400 });
        }

        const session = ptyManager.get(sessionId);
        if (!session) {
          return new Response(`Session '${sessionId}' not found`, { status: 404 });
        }

        const upgraded = server.upgrade(req, {
          data: { sessionId },
        });

        if (upgraded) {
          return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 500 });
      }

      if (url.pathname === "/api/sessions") {
        const sessions = ptyManager.list();
        return Response.json(sessions);
      }

      if (url.pathname.startsWith("/api/sessions/")) {
        const sessionId = url.pathname.split("/")[3];
        if (!sessionId) {
          return new Response("Invalid session ID", { status: 400 });
        }
        const session = ptyManager.get(sessionId);
        if (!session) {
          return Response.json({ error: "Session not found" }, { status: 404 });
        }
        return Response.json(session);
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(DASHBOARD_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },

    websocket: {
      open(ws: ServerWebSocket<WebSocketData>) {
        const { sessionId } = ws.data;
        log.info("websocket connected", { sessionId });

        const session = ptyManager.get(sessionId);
        if (session) {
          ws.send(JSON.stringify({
            type: "session",
            session,
          }));
        }

        ws.data.unsubOutput = emitter.subscribeOutput(sessionId, (data) => {
          try {
            ws.send(JSON.stringify({ type: "output", data }));
          } catch {
          }
        });

        ws.data.unsubState = emitter.subscribeState(sessionId, (status, exitCode) => {
          try {
            ws.send(JSON.stringify({ type: "state", status, exitCode }));
          } catch {
          }
        });
      },

      message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
        const { sessionId } = ws.data;

        try {
          const msg = JSON.parse(message.toString()) as WSMessage;

          if (msg.type === "input") {
            const success = ptyManager.write(sessionId, msg.data);
            if (!success) {
              ws.send(JSON.stringify({
                type: "error",
                message: "Failed to write to session",
              }));
            }
            return;
          }

          if (msg.type === "history") {
            const result = ptyManager.read(sessionId, msg.offset ?? 0, msg.limit ?? 1000);
            if (result) {
              const historyData = result.lines.join("");
              ws.send(JSON.stringify({
                type: "history",
                data: historyData,
                totalLines: result.totalLines,
                hasMore: result.hasMore,
              }));
              return;
            }
            ws.send(JSON.stringify({
              type: "error",
              message: "Failed to read history",
            }));
            return;
          }

          if (msg.type === "resize") {
            log.info("resize requested", { sessionId, cols: msg.cols, rows: msg.rows });
            return;
          }

          ws.send(JSON.stringify({
            type: "error",
            message: "Unknown message type",
          }));
        } catch {
          ws.send(JSON.stringify({
            type: "error",
            message: "Invalid message format",
          }));
        }
      },

      close(ws: ServerWebSocket<WebSocketData>) {
        const { sessionId } = ws.data;
        log.info("websocket disconnected", { sessionId });

        ws.data.unsubOutput?.();
        ws.data.unsubState?.();
      },

      drain() {
      },
    },
  });

  log.info("web server started", { url: `http://localhost:${port}` });
  return activeServer;
}

export function stopWebServer(): boolean {
  if (!activeServer) {
    log.warn("web server not running");
    return false;
  }

  log.info("stopping web server");
  activeServer.stop();
  activeServer = null;
  return true;
}

export function getWebServer(): ReturnType<typeof Bun.serve> | null {
  return activeServer;
}

export function isWebServerRunning(): boolean {
  return activeServer !== null;
}
