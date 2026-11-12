-- Defence in depth for the rights model (hand-written custom migration).

-- 1. Keep updated_at correct even for raw SQL writes.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_set_updated_at', t);
  END LOOP;
END;
$$;--> statement-breakpoint

-- 2. A book cannot be (or become) published without an approved or restricted licence.
CREATE FUNCTION books_publish_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published' AND NOT EXISTS (
    SELECT 1 FROM licenses l
    WHERE l.book_id = NEW.id AND l.rights_status IN ('approved', 'restricted')
  ) THEN
    RAISE EXCEPTION 'book % cannot be published without an approved or restricted licence', NEW.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'books_publish_requires_license';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER books_publish_guard
BEFORE INSERT OR UPDATE ON books
FOR EACH ROW WHEN (NEW.status = 'published')
EXECUTE FUNCTION books_publish_guard();--> statement-breakpoint

-- 3. A licence cannot be downgraded (pending/removed) or deleted while its book is still
--    published. Deferred to commit so "mark removed + unpublish" works in one transaction.
CREATE FUNCTION licenses_published_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.rights_status IN ('approved', 'restricted') AND NEW.book_id = OLD.book_id THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM books b WHERE b.id = OLD.book_id AND b.status = 'published') THEN
    RAISE EXCEPTION 'licence for published book % must stay approved or restricted (unpublish the book in the same transaction)', OLD.book_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'licenses_published_requires_rights';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER licenses_published_guard
AFTER UPDATE OR DELETE ON licenses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION licenses_published_guard();
