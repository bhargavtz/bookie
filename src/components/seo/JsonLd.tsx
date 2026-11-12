import { serializeJsonLd, type JsonLdObject } from "@/lib/seo";

/**
 * The single allow-listed use of dangerouslySetInnerHTML. The payload is built
 * by `lib/seo` from catalogue fields and serialised with JSON.stringify, with
 * `<` escaped, so it cannot terminate the script element. The script type is
 * not executable.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
