import { log, WebSocket } from "../../deps.ts";

export default function handler(connection: WebSocket, message: string) {
  const logger = log.getLogger();
  const payload = JSON.parse(message);

  switch (payload.type) {
    case "hello": {
      logger.info("got 'hello' from middleman");
    } break;
  }
}