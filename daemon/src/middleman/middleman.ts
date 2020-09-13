import { connectWebSocket, isWebSocketCloseEvent, log } from "../deps.ts";
import handler from "./messaging/handler.ts";

export default async function middleman(endpoint: string): Promise<void> {
  const logger = log.getLogger();

  try {
    const socket = await connectWebSocket(endpoint);
    logger.info("middleman connected");

    for await (const message of socket) {
      if (typeof message === "string") {
        logger.debug("middleman message", message);
        handler(socket, message);
      }
      else if (isWebSocketCloseEvent(message)) {
        logger.info("middleman connection closed", message.code, message.reason);
        return;
      }
    }
  }
  catch (error) {
    logger.error("middleman error", error);
  }
}
