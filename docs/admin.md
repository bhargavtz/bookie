# Admin guide

State described: working tree on top of `c6e855b`, 2026-11-12. Design: [wiki/decision-admin-auth.md](wiki/decision-admin-auth.md), [wiki/decision-rights-enforcement.md](wiki/decision-rights-enforcement.md).

## 1. Create the admin credential

There is one bootstrap admin, configured through the environment, and it signs in with role `owner`. There is no sign-up and no default password. No screen or script creates additional admin users (2026-11-12); the `editor` and `reviewer` roles exist in the code and database but have no creation path yet ([open-questions.md](open-questions.md)).

1. Run `npm run admin:hash`. It asks for a password twice on a hidden prompt (minimum 12 characters) and prints only a hash of the form `scrypt$N$r$p$salt$hash` (N=2^17, about 128 MB of memory per hash). For automation it also reads the password from stdin: `printf '%s' "$PASSWORD" | npm run admin:hash --silent`. The password is never accepted as an argument and never printed.
2. Put the hash and your address in your environment (for example `.env.local`, never committed):
   - `ADMIN_EMAIL=you@your-domain.example`
   - `ADMIN_PASSWORD_HASH=<the printed hash>`
3. Restart the server. Both variables must be set together; if either is missing the admin returns 404.
4. To change the password, generate a new hash and replace the variable; the stored hash follows the environment at the next sign-in.

## 2. Sign in

Open `/admin/login`. Wrong email and wrong password give the same message. Five failed attempts in 15 minutes (per account, and per client address when `TRUST_PROXY=true` provides one) lock sign-in temporarily. A session is a random token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie (`__Host-` prefixed in production), stored hashed in the database, ending after 30 minutes idle or 8 hours total, or at Sign out. The `Secure` flag means browsers may not keep the cookie over plain `http` outside `localhost`; use https in production. Mutating requests check the `Origin` header.

## 3. Roles

| Role | Can |
| --- | --- |
| owner | everything |
| editor | edit books, upload files, manage categories, authors and collections, run CSV imports, view duplicates, save draft licence evidence; **cannot** approve rights, publish or handle takedowns |
| reviewer | approve, restrict or remove rights, publish, reject and unpublish, handle takedowns, read the audit log; cannot edit books or upload files |

The map is in `src/server/auth/permissions.ts`; unknown roles and actions are denied.

## 4. Add a book

1. **Create the draft**: Books, New book. Enter title, authors, optional categories, technologies and tags, and other metadata. The book is a `draft`. It is invisible to the public.
   - Categories and technologies are referenced by slug. Technologies must already exist in the database; no screen or bootstrap creates them (2026-11-12), so a technology slug that does not exist is rejected.
2. **Upload the PDF** (book page). The server checks size (`MAX_UPLOAD_BYTES`), that the file starts with `%PDF-`, contains `%%EOF` near the end, and records its sha256; it never trusts the declared type or filename. A PDF with the same sha256 as an existing live PDF is rejected as an exact duplicate (409). The asset must become `ready`.
3. **Upload a cover** (optional): PNG, JPEG or WebP up to 5 MiB, detected from the bytes. If no cover is uploaded the site draws a generated one.
4. **Record rights** (licence form, section 5).
5. **Submit for review** (draft or unpublished books), then a reviewer or owner **publishes** (section 5).
6. **Check the result** by opening the public book page in a private window.

Admins can preview unpublished books that have a ready file; previews are not indexed and do not count as downloads.

## 5. Licence approval rules

Defaults are deny. A new book is `draft`. A new licence is `pending` with reading and download both off. Unknown rights mean unpublished.

Licence states and their effect on the public site:

| State | Listed | Read online | Download | Detail page |
| --- | --- | --- | --- | --- |
| none, `pending`, or expired (`expires_at` passed) | no | no | no | 404 |
| `approved` | yes | only if "Allow reading online" | only if "Allow download" | 200 |
| `restricted` | yes | only if "Allow reading online" | never | 200 |
| `removed` | no | no | no | 410 (no title or cover) |

Every positive result also needs: book `published`, not deleted, and a `ready` primary PDF.

**Who may do what**: staying `pending` (draft evidence) is `license.edit` (editor, reviewer, owner). Moving to, within, or out of `approved`, `restricted` or `removed` requires `license.review` (reviewer, owner). Approving or restricting stamps the acting admin and the time as approver.

**Publishing is blocked until all of these hold** (`canPublish`, plus a database trigger that refuses `published` without an approved or restricted licence):

- title and slug present, book not deleted;
- a licence that is `approved` or `restricted`, not expired;
- rights holder and licence type recorded;
- a source URL **or** an evidence note;
- approver and approval time recorded (set automatically when a reviewer approves);
- a `ready` primary PDF with a recorded sha256;
- no unresolved duplicate flag.

An attempt that fails answers `publish_blocked` and lists every missing requirement. Publishing requires role reviewer or owner. Editors can submit but not publish.

Moving a published book's licence to `pending` or `removed` unpublishes it in the same transaction. Every rights or publish change writes an audit log row in the same transaction. URLs in the licence form must be https, must not point to private addresses, and are stored only; the server never fetches them.

## 6. Takedown workflow

1. A rights holder submits the public form at `/takedown` (it requires `CONTACT_EMAIL` to be set, otherwise the form is disabled), or you receive a complaint elsewhere. Submissions land in the admin Takedowns queue as `open`. There is no email notification (2026-11-12); check the queue regularly.
2. A reviewer or owner triages: set `under_review`, `rejected` or `withdrawn` with a note, which does not remove the book.
3. To uphold, use **Remove** (or "Record a takedown and remove a book" for a complaint received outside the form). In one transaction this sets the licence to `removed` with reading and download off, unpublishes the book, marks the request `upheld` with your reason and writes the audit row. Public access ends at once for files (`private, max-age=0`); home and collection shelves may show the title for up to 60 seconds because they are cached.
4. Storage objects are **kept** as evidence; there is no purge action. Deleting files is a separate, deliberate decision.

The takedown wording, notice-and-counter-notice process, designated agent and response times need review by a qualified lawyer ([open-questions.md](open-questions.md)).

## 7. CSV import

Admin, Import. Upload or paste a CSV, run a **dry run** (the default) to see a per-row report, then import. The import creates **metadata only**: every row becomes a `draft`. Nothing is published and no rights are granted. If a row has `source_url`, a `pending` licence is created holding that URL as evidence; it is stored, never fetched.

Limits: 2 MiB, 5000 rows, 40 columns. UTF-8 with or without BOM, comma separated, RFC 4180 quoting. Header names are case-insensitive and spaces or hyphens become underscores. Unknown columns are ignored and reported. Each row is saved in its own transaction, so one bad row does not block the others. A dry run and a commit both write an import job and an audit row.

| Column | Required | Notes |
| --- | --- | --- |
| `title` | yes | |
| `authors` | yes | separate several with `;` or `|` |
| `subtitle`, `description`, `edition`, `publisher` | no | |
| `language` | no | defaults to `en` |
| `isbn` | no | ISBN-13 with a valid check digit; a duplicate in the file or database is an error |
| `published_year`, `page_count` | no | whole numbers |
| `level` | no | `beginner`, `intermediate` or `advanced` |
| `categories` | no | category **slugs** (for example `databases`), `;` or `|` separated; unknown slug is an error |
| `technologies` | no | technology slugs, same rules; unknown slug is an error |
| `tags` | no | free text, `;` or `|` separated |
| `source_url` | no | https URL, stored as evidence only |

Similar titles produce warnings, not errors. Example with made-up values:

```csv
title,authors,subtitle,language,level,categories,tags,published_year,source_url
Example Handbook of Imaginary Algorithms,Ada Example;Sam Sample,A fictional title for testing,en,beginner,algorithms-data-structures,example;demo,2020,https://example.com/evidence/handbook
"Sample Guide to Pretend Databases, Volume 1",Pat Placeholder,,en,intermediate,databases,,2018,
```

Use only titles you have rights evidence for in a real import. The import never decides rights.

## 8. Other screens

Overview (counts), Books (search, status filter, rights filter), Authors, Categories, Collections, Duplicates (checksum, ISBN and similar-title groups), Takedowns, and an audit log API (`/api/admin/audit`). The Books list "rights" filter is applied to the current page of results only (the list service has no rights filter), so it can hide matches that sit on other pages.
