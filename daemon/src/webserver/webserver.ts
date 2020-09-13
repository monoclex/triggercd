import { Application } from "../deps.ts";

export default function webserver(): Promise<void> {
  const app = new Application();

  // TODO: routes so that daemon-cli can ping the daemon for stuff

  app.start({ port: 80 });
  return app.θprocess!;
}