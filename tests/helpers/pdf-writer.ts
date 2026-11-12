/**
 * Minimal, dependency-free, deterministic PDF writer for test fixtures.
 * Produces valid PDF 1.4 with a classic xref table, one Helvetica font and
 * selectable ASCII text. No timestamps or random ids, so output is byte-stable.
 */

export type PdfPage = { lines: string[] };
export type PdfDocument = { title: string; pages: PdfPage[] };

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const LEADING = 15;

const escapePdfText = (s: string): string => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");

/** Greedy word wrap on character count (Helvetica 11pt is about 90 chars across 468pt). */
export function wrapLines(text: string, width = 88): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line.length > 0 && line.length + 1 + word.length > width) {
        out.push(line);
        line = word;
      } else {
        line = line.length > 0 ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
}

function pageStream(lines: string[]): string {
  const body = lines.map((l) => `(${escapePdfText(l)}) Tj T*`).join("\n");
  return `BT\n/F1 11 Tf\n${LEADING} TL\n${MARGIN} ${PAGE_H - MARGIN} Td\n${body}\nET`;
}

export function buildPdf(doc: PdfDocument): Buffer {
  if (doc.pages.length === 0) throw new Error("a PDF needs at least one page");
  const objects: string[] = []; // index i holds object number i + 1
  const pageCount = doc.pages.length;
  // Object layout: 1 catalog, 2 pages, 3 font, 4 info, then (page, content) pairs.
  const firstPageObj = 5;
  const kids = doc.pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push(`<< /Title (${escapePdfText(doc.title)}) /Producer (bookie test fixture writer) >>`);
  doc.pages.forEach((page, i) => {
    const contentObj = firstPageObj + i * 2 + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    const stream = pageStream(page.lines);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets: number[] = [];
  let position = parts[0]?.length ?? 0;
  objects.forEach((body, i) => {
    offsets.push(position);
    const chunk = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    parts.push(chunk);
    position += chunk.length;
  });
  const xrefStart = position;
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  parts.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(parts);
}

/** Starts with a valid %PDF- header but the rest is deterministic junk: no objects, no xref, no trailer. */
export function buildCorruptPdf(): Buffer {
  let seed = 0x2545f491;
  const junk = Buffer.alloc(2048);
  for (let i = 0; i < junk.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    junk[i] = seed >>> 24;
  }
  return Buffer.concat([Buffer.from("%PDF-1.4\n", "latin1"), junk]);
}
