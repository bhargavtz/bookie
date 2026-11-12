import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha256Hex } from "@/lib/checksum";
import { buildCorruptPdf, buildPdf, wrapLines, type PdfDocument } from "./pdf-writer";

/**
 * Test PDFs are generated from original text written for this project, so there
 * is no third-party licensing question. Content is deterministic.
 */
export type PdfFixtureKind = "searchable" | "multipage" | "restricted" | "corrupt";

export type PdfFixtureInfo = {
  file: string;
  kind: PdfFixtureKind;
  title: string;
  /** 0 for the corrupt fixture. */
  pages: number;
  bytes: number;
  sha256: string;
  /** A phrase that appears in the extracted text (empty for corrupt). */
  searchPhrase: string;
};

const chapter = (n: number): string[] =>
  wrapLines(
    `Chapter ${n}\n\nThis page belongs to the Bookie multi-page sample. It exists so that page navigation, ` +
      `zoom and text search can be tested against a document whose content is known. Marker phrase: ` +
      `lantern-orchard-${String(n).padStart(2, "0")}.`,
  );

function documents(): { kind: PdfFixtureKind; file: string; doc: PdfDocument; searchPhrase: string }[] {
  return [
    {
      kind: "searchable",
      file: "searchable.pdf",
      searchPhrase: "quokka indexing",
      doc: {
        title: "Bookie Searchable Sample",
        pages: [
          {
            lines: wrapLines(
              "Bookie Searchable Sample\n\nThis is an original sample document written for the Bookie test suite. " +
                "It contains the unusual phrase quokka indexing so that search results can be asserted exactly.\n\n" +
                "A second paragraph mentions heap sort, binary search and hash tables, which is ordinary computer science vocabulary.",
            ),
          },
          { lines: wrapLines("Second page of the searchable sample.\n\nThe closing marker is velvet-comet-7.") },
        ],
      },
    },
    {
      kind: "multipage",
      file: "multipage.pdf",
      searchPhrase: "lantern-orchard-12",
      doc: {
        title: "Bookie Multi-page Sample",
        pages: Array.from({ length: 24 }, (_, i) => ({ lines: chapter(i + 1) })),
      },
    },
    {
      kind: "restricted",
      file: "restricted.pdf",
      searchPhrase: "restricted sample",
      doc: {
        title: "Bookie Restricted Sample",
        pages: [
          {
            lines: wrapLines(
              "RESTRICTED SAMPLE\n\nThis fixture stands in for a title whose licence allows reading but never downloading. " +
                "Tests attach a restricted licence to it and assert that the file route refuses the attachment download.",
            ),
          },
          { lines: wrapLines("Page two of the restricted sample. Marker: copper-lighthouse-3.") },
          { lines: wrapLines("Page three of the restricted sample. Marker: copper-lighthouse-4.") },
        ],
      },
    },
  ];
}

export async function generateTestPdfs(outDir: string): Promise<PdfFixtureInfo[]> {
  await mkdir(outDir, { recursive: true });
  const infos: PdfFixtureInfo[] = [];
  for (const d of documents()) {
    const bytes = buildPdf(d.doc);
    await writeFile(path.join(outDir, d.file), bytes);
    infos.push({
      file: d.file,
      kind: d.kind,
      title: d.doc.title,
      pages: d.doc.pages.length,
      bytes: bytes.length,
      sha256: sha256Hex(bytes),
      searchPhrase: d.searchPhrase,
    });
  }
  const corrupt = buildCorruptPdf();
  await writeFile(path.join(outDir, "corrupt.pdf"), corrupt);
  infos.push({
    file: "corrupt.pdf",
    kind: "corrupt",
    title: "Corrupt PDF",
    pages: 0,
    bytes: corrupt.length,
    sha256: sha256Hex(corrupt),
    searchPhrase: "",
  });
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(infos, null, 2)}\n`);
  return infos;
}
