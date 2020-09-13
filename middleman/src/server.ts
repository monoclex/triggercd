import { Application } from "./deps.ts";
import handle from "./websocket/handle.ts";

export default async function server(): Promise<void> {
  const app = new Application();

  app.get("/ws", handle);
  app.start({ port: 80 });

  return app.θprocess!;
}