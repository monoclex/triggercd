import { Application } from "./deps.ts";
import { execute } from "./scripts/execution.ts";
import { Habitat } from "./scripts/habitats.ts";
import { resolveScript } from "./scripts/resolution.ts";

const textDecoder = new TextDecoder();

export interface Configuration {
  webhooks: string;
  habitats: string;
  logs: string;
  shell: string;
  port: number;
  debug: boolean;
}

export async function runWebServer(config: Configuration): Promise<void> {
  const { webhooks, habitats, shell, port, debug } = config;

  const habitat = new Habitat(habitats);

  const app = new Application();

  app
  .get("/webhooks/:id", async (context) => {
    if (!debug) {
      context.string("enable debug mode (pass the --debug argument) to view information about this webhook", 500);
      return;
    }

    const { id } = context.params;

    const resolvedScript = await resolveScript(id, webhooks);

    if (resolvedScript === null) {
      context.string(
`unable to resolve script

webhooks directory: '${webhooks}'
webhook id: '${id}'

please follow the Script Resolving Algorithm for more information <doc link>
// TODO: maybe provide information about the directory?
`,
        500,
      );
      return;
    }

    context.string(
`webhook id: '${id}'
script path: '${resolvedScript.path}' (type: '${resolvedScript.type}')
webhooks directory: '${webhooks}'
`,
      200,
    );
  })
  .post("/webhooks/:id", async (context) => {
    const { id } = context.params;

    // here, we enforce the id to only contain specific characters to not trip up
    // any other part of the code. that way, there can be no fancy file name
    // mangling with ".." or any other funny business.
    if (!/[a-zA-Z0-9_\-]*/.test(id)) {
      context.string("webhook id failed regex test /[a-zA-Z0-9_\-]*/", 400);
      return;
    }

    // resolve the script to run
    const resolvedScript = await resolveScript(id, webhooks);

    if (resolvedScript === null) {
      context.string(
`failed to resolve script '${id}'.
please see the Script Resolving Algorithm <doc link>
or ensure that you've mounted a /webhooks/ volume <doc link>
`,
        500,
      );
      return;
    }
    
    const { path: habitatPath, id: habitatId } = await habitat.rent();

    const secret = context.request.headers.get("X-Hub-Signature");

    const payload = JSON.stringify({
      headers: {
        // TODO: other headers?
        secret
      },
      body: textDecoder.decode(await context.body<Uint8Array>())
    });

    try {
      const activeScript = await execute(resolvedScript, {
        habitatPath,
        webhookBody: payload,
        shell,
      });

      // stream the results to the caller
      context.blob(activeScript.output, "text/plain", 200);

      try {
        await activeScript.execution;
      } catch (error) {
        console.error(error);
      }
    }
    finally {
      habitat.return(habitatId);
    }

    return;
  })
    .start({ port });
}
