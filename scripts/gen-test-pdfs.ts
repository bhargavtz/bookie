/** Writes deterministic test PDFs to tests/fixtures/generated/ (gitignored). Runs as `pretest`. */
import path from "node:path";
import { generateTestPdfs } from "../tests/helpers/pdf-fixtures";

const outDir = path.join(process.cwd(), "tests", "fixtures", "generated");

generateTestPdfs(outDir)
  .then((infos) => {
    console.warn(`generated ${infos.length} test PDFs in tests/fixtures/generated`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "failed to generate test PDFs");
    process.exit(1);
  });
