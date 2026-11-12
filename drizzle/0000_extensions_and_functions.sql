-- Extensions and helper functions required by the schema (hand-written custom migration).
-- pg_trgm: typo-tolerant search. unaccent: accent-insensitive search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
-- unaccent() is only STABLE, so it cannot be used in a generated column. This
-- wrapper pins the dictionary and is declared IMMUTABLE (the standard workaround).
CREATE FUNCTION bookie_unaccent(input text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, input) $$;
