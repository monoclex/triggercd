import { Application, path } from "./deps.ts";
import { execute } from "./scripts/execution.ts";
import { resolveScript } from "./scripts/resolution.ts";

let habitatId = 0;
const textDecoder = new TextDecoder();

export interface Configuration {
  webhooks: string;
  habitats: string;
  shell: string;
  port: number;
}

export async function runWebServer(config: Configuration): Promise<void> {
  const { webhooks, habitats, shell, port } = config;

  // ensure the habitats folder exists
  try {
    await Deno.stat(habitats);
  } catch {
    await Deno.mkdir(habitats);
  }

  const app = new Application();

  app.post("/webhook/:id", async (context) => {
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

    const habitatPath = path.join(habitats, `${habitatId++}`);

    const activeScript = await execute(resolvedScript, {
      habitatPath,
      webhookBody: textDecoder.decode(await context.body<Uint8Array>()),
      shell,
    });

    context.blob(activeScript.output, "text/plain", 200);
    await activeScript.execution;
    return;
  })
    .start({ port });
}
