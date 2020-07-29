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
export function resolveScript(id: string, webhooksDir: string = "/webhooks/"): Promise<ResolvedScript | null> {

  // warning: this is a LOT of abstraction bullcrud, it's probably best you don't even try fully understand it
  // i think this is what they call "going overboard"
  // but anyways, up above is exactly the steps, which correlate to what you see in the last return statement. enjoy!

  const fullyResolvedScriptPath = (scriptPath: string): string => path.resolve(path.join(webhooksDir, scriptPath));
  const runItAsADenoScript = (scriptPath: string): ResolvedScript => ({ path: fullyResolvedScriptPath(scriptPath), type: "deno" });
  const runItAsAShellScript = (scriptPath: string): ResolvedScript => ({ path: fullyResolvedScriptPath(scriptPath), type: "shell" });

  const ifItIsAFile = (_: unknown, fileInfo: FileInfo) => fileInfo.isFile;
  const ifItIsADirectory = (_: unknown, fileInfo: FileInfo) => fileInfo.isDirectory;

  const getFileInfo = (name: string) => statFile(path.join(webhooksDir, name));

  // i generally dislike manually spacing all arguments to be the same but *eh*
  return consider(`${id}.ts`,       getFileInfo, ifItIsAFile,      runItAsADenoScript)
    .or(          `${id}.sh`,       getFileInfo, ifItIsAFile,      runItAsAShellScript)
    .or(          `${id}`,          getFileInfo, ifItIsADirectory, () => (
      consider(   `${id}/run.ts`,   getFileInfo, ifItIsAFile,      runItAsADenoScript)
      .or(        `${id}/${id}.ts`, getFileInfo, ifItIsAFile,      runItAsADenoScript)
      .or(        `${id}/run.sh`,   getFileInfo, ifItIsAFile,      runItAsAShellScript)
      .or(        `${id}/${id}.sh`, getFileInfo, ifItIsAFile,      runItAsAShellScript)
      .take()
    ))
    .take();
}

export interface ResolvedScript {
  path: string;
  type: "deno" | "shell";
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
interface FileInfo {
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

// this is an entire mini-library ffs
// i went overboard writing code nobody will even want to understand
// weeee

function consider<TState, TCompute, TResult>(
  state: TState,
  compute: (state: TState) => TCompute | Promise<TCompute>,
  matches: (state: TState, computed: TCompute) => boolean | Promise<boolean>,
  result: (state: TState, computed: TCompute) => TResult | Promise<TResult>
): ConsiderChain<TState, TCompute, TResult> {
  return new ConsiderChain<TState, TCompute, TResult>(state, compute, matches, result);
}

interface Takeable<T> {
  take(): Promise<T | null>;
}

class ConsiderChain<TState, TCompute, TResult> {
  constructor(
    public readonly state: TState,
    public readonly compute: (state: TState) => TCompute | Promise<TCompute>,
    public readonly matches: (state: TState, computed: TCompute) => boolean | Promise<boolean>,
    public readonly result: (state: TState, computed: TCompute) => null | TResult | Promise<TResult | null>,
    private readonly _parent?: Takeable<TResult>,
  ) {}

  or<TState, TCompute>(
    state: TState,
    compute: (state: TState) => TCompute | Promise<TCompute>,
    matches: (state: TState, computed: TCompute) => boolean | Promise<boolean>,
    result: (state: TState, computed: TCompute) => null | TResult | Promise<TResult | null>,
  ): ConsiderChain<TState, TCompute, TResult> {
    return new ConsiderChain<TState, TCompute, TResult>(state, compute, matches, result, this);
  }

  async take(): Promise<TResult | null> {
    const computed = await this.compute(this.state);

    if (await this.matches(this.state, computed)) {
      const result = await this.result(this.state, computed);

      // if the result is null, we want to try consume the parent's considerations
      if (result !== null) {
        // if it's not null, we have a result
        return result;
      }
    }

    if (this._parent) {
      return await this._parent.take();
    }

    return null;
  }
}
