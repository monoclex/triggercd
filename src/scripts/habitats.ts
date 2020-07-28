import { path } from "./deps.ts";

export interface HabitatRent {
  id: number;
  path: string;
}

/**
 * For deno scripts, caching works based off of the file path. Meaning that if a deno script is desired to be ran, if the habitat id were
 * to sequentially increment, deno must re-process the entire file (typechecking, dependency fetching, etc.) before it can be ran. This
 * leads to up to 800ms delays before the actual code is ran.
 * 
 * To resolve this, this utility class will attempt to reuse lower habitat numbers if they're not in use. That way, the probability that
 * the same deno script ends up in the same habitat id as it was before is significantly higher.
 * 
 * Some possible improvements would be having the habitats be unique per webhook, decreasing the likelihood of collisions across webhooks.
 * At the time of writing, that improvement is excessive.
 */
export class Habitat {
  constructor(
    public readonly habitatsPath: string
  ) {}

  #rented: Record<number, true> = {};

  rent(): HabitatRent {
    let id = 0;

    while (true) {
      if (this.#rented[id]) {
        id++;
        continue;
      }
      
      break;
    }

    this.#rented[id] = true;

    return {
      id,
      path: path.join(this.habitatsPath, id.toString())
    };
  }

  return(id: number): void {
    delete this.#rented[id];
  }
}