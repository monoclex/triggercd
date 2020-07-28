import { path } from "./deps.ts";

/**
 * Resolves a script using the Script Resolving Algorithm.
 * 
 * Script Resolving Algorithm:
 * 1. if /webhooks/`webhookname`.ts is a file, run it as a deno script
 * 2. if /webhooks/`webhookname`.sh is a file, run it as a bash script
 * 3. if /webhooks/`webhookname` is a directory,
 *   1. if /webhooks/`webhookname`/run.ts exists, run it as a deno script
 *   2. if /webhooks/`webhookname`/`webhookname`.ts exists, run it as a deno script
 *   3. if /webhooks/`webhookname`/run.sh exists, run it as a bash script
 *   4. if /webhooks/`webhookname`/`webhookname`.sh exists, run it as a bash script
 * 4. report an error
 * 
 * * when running as a script, the first argument is a JSON representation of the webhook request.
 * 
 * @param id The ID of the webhook to resolve the script for.
 * @returns `null` when a script couldn't be found. Otherwise, returns the name
 * of the script to run.
 */
export async function resolveScript(id: string, webhooksDir: string = "/webhooks/"): Promise<ResolvedScript | null> {

  // TODO: update function code to match specification above
  const scriptDeno = await statFile(path.join(webhooksDir, `${id}.ts`));
  if (scriptDeno.isFile) {
    return { type: "deno", path: scriptDeno.path };
  }

  const scriptBash = await statFile(path.join(webhooksDir, `${id}.sh`));
  if (scriptBash.isFile) {
    return { type: "bash", path: scriptBash.path };
  }

  const scriptDirectory = await statFile(path.join(webhooksDir, id));
  if (scriptDirectory.isDirectory) {
    const onTriggerDeno = await statFile(`/webhooks/${id}/on-trigger.ts`);
    if (onTriggerDeno.isFile) {
      return { type: "deno", path: onTriggerDeno.path };
    }

    const webhookScriptDeno = await statFile(`/webhooks/${id}/${id}.ts`);
    if (webhookScriptDeno.isFile) {
      return { type: "deno", path: webhookScriptDeno.path };
    }

    const onTriggerBash = await statFile(`/webhooks/${id}/on-trigger.sh`);
    if (onTriggerBash.isFile) {
      return { type: "bash", path: onTriggerBash.path };
    }

    const webhookScriptBash = await statFile(`/webhooks/${id}/${id}.sh`);
    if (webhookScriptBash.isFile) {
      return { type: "bash", path: webhookScriptBash.path };
    }
  }
  
  if (scriptDirectory.isFile) {
    return { type: "bash", path: scriptDirectory.path };
  }

  return null;
}

export interface ResolvedScript {
  path: string;
  type: "deno" | "bash";
}

/**
 * Safely returns a {@link FileInfo} for any path. Erases the possibility of
 * failure by returning "false" for all fields.
 * @param path The path to get the file info for.
 */
async function statFile(path: string): Promise<FileInfo> {
  try {
    return {
      ...await Deno.stat(path),
      path
    };
  }
  catch (error) {
    return {
      path,
      isDirectory: false,
      isFile: false
    };
  }
}

/**
* Simplified model of FileInfo which contains only the fields needed for this
* application.
*/
export interface FileInfo {
 path: string;
 isDirectory: boolean;
 isFile: boolean;
}

