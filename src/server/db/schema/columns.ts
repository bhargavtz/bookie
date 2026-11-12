import { sql } from "drizzle-orm";
import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

export const idColumn = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const timestamps = () => ({
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  // Also maintained by the set_updated_at() trigger (migration), so raw SQL stays correct.
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
