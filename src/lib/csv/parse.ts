/**
 * Minimal RFC 4180 CSV reader (pure; no I/O, no network). Handles a UTF-8 BOM,
 * CRLF/LF/CR line ends, quoted fields with doubled quotes and embedded newlines.
 * Rejects (instead of guessing) an unterminated quote or a stray quote inside an
 * unquoted field.
 */

export class CsvParseError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.name = "CsvParseError";
    this.line = line;
  }
}

export type CsvLimits = { maxBytes: number; maxRows: number; maxColumns: number };
export const DEFAULT_CSV_LIMITS: CsvLimits = { maxBytes: 2 * 1024 * 1024, maxRows: 5000, maxColumns: 40 };

export type CsvRecord = {
  /** 1-based line number in the file where the record starts (the header is line 1). */
  line: number;
  values: Record<string, string>;
};

export type ParsedCsv = { columns: string[]; records: CsvRecord[] };

/** "Published Year" -> "published_year". */
export function normalizeColumnName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

type RawRow = { line: number; cells: string[] };

function tokenize(input: string): RawRow[] {
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let line = 1;
  let rowLine = 1;
  let i = 0;

  const endField = (): void => {
    cells.push(field);
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = (): void => {
    endField();
    // A completely blank line is not a record.
    if (!(cells.length === 1 && cells[0] === "")) rows.push({ line: rowLine, cells });
    cells = [];
  };

  while (i < input.length) {
    const ch = input.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (input.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        const next = input.charAt(i);
        if (i < input.length && next !== "," && next !== "\n" && next !== "\r") {
          throw new CsvParseError("unexpected character after closing quote", line);
        }
        continue;
      }
      if (ch === "\n") line += 1;
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      if (field !== "" || fieldWasQuoted) throw new CsvParseError("quote inside an unquoted field", line);
      inQuotes = true;
      fieldWasQuoted = true;
      i += 1;
    } else if (ch === ",") {
      endField();
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      if (ch === "\r" && input.charAt(i + 1) === "\n") i += 1;
      i += 1;
      line += 1;
      rowLine = line;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (inQuotes) throw new CsvParseError("unterminated quoted field", rowLine);
  if (field !== "" || fieldWasQuoted || cells.length > 0) endRow();
  return rows;
}

/** Parses CSV text with a header row. Throws CsvParseError on structural problems or exceeded limits. */
export function parseCsv(text: string, limits: CsvLimits = DEFAULT_CSV_LIMITS): ParsedCsv {
  if (Buffer.byteLength(text, "utf8") > limits.maxBytes) {
    throw new CsvParseError(`file is larger than ${limits.maxBytes} bytes`, 1);
  }
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = tokenize(input);
  const header = rows[0];
  if (header === undefined) throw new CsvParseError("file is empty", 1);
  const columns = header.cells.map(normalizeColumnName);
  if (columns.length > limits.maxColumns) throw new CsvParseError(`more than ${limits.maxColumns} columns`, 1);
  if (columns.some((c) => c === "")) throw new CsvParseError("header contains an empty column name", 1);
  if (new Set(columns).size !== columns.length) throw new CsvParseError("header contains duplicate column names", 1);
  const body = rows.slice(1);
  if (body.length > limits.maxRows) throw new CsvParseError(`more than ${limits.maxRows} data rows`, 1);

  const records: CsvRecord[] = body.map((row) => {
    if (row.cells.length > columns.length) {
      throw new CsvParseError(`row has ${row.cells.length} fields but the header has ${columns.length}`, row.line);
    }
    const values: Record<string, string> = {};
    columns.forEach((name, index) => {
      values[name] = (row.cells[index] ?? "").trim();
    });
    return { line: row.line, values };
  });
  return { columns, records };
}
