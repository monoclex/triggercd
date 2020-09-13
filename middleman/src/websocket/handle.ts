import { acceptWebSocket, Context, isWebSocketCloseEvent, log } from "../deps.ts";

export default async function handle(context: Context) {
  const logger = log.getLogger();

  const { conn, headers, r: bufReader, w: bufWriter } = context.request;
  const websocket = await acceptWebSocket({
    conn, headers, bufReader, bufWriter
  });

  try {
    for await (const event of websocket) {
      if (typeof event === "string") {
        logger.debug("websocket")
      }
      else if (isWebSocketCloseEvent(event)) {
        logger.debug("websocket connection closed", event.code, event.reason);
      }
    }
  }
  catch (err) {
    logger.warning("websocket websocket error", err);

    if (!websocket.isClosed) {
      try {
        await websocket.close(5000);
      }
      catch (err) {
        logger.warning("error closing websocket on websocket error handler", err);
      }
    }
  }
}