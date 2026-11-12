import { normalizeSearchText } from "@/lib/search/normalize";
import type { AutocompleteQuery } from "@/lib/search/schemas";
import type { Suggestion } from "@/lib/search/types";
import type { Db } from "@/server/db/client";
import { suggest } from "@/server/repositories/catalogue";

export type SearchDeps = { db: Db; now?: () => Date };

/** Search use cases. Full search itself lives on the catalogue service (`searchBooks`) so both share one visibility path. */
export function createSearchService({ db, now: clock = () => new Date() }: SearchDeps) {
  return {
    async autocomplete(query: AutocompleteQuery): Promise<Suggestion[]> {
      const term = normalizeSearchText(query.q);
      return term === "" ? [] : suggest(db, clock(), term, query.limit);
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
