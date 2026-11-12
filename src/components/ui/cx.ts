/** Joins class names, dropping falsy entries. Kept tiny on purpose: no variant engine. */
export function cx(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" ");
}
