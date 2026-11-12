import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdfReader } from "@/components/reader/PdfReader";
import { readerAccess } from "@/server/services/files";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

// Reader pages are never indexed; the title is only revealed when the policy allows reading.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const outcome = await readerAccess(slug);
  return outcome.ok ? { title: `Reading ${outcome.access.title}`, robots: { index: false, follow: false } } : { title: "Reader", robots: { index: false, follow: false } };
}

function Notice({ heading, children }: { heading: string; children: string }) {
  return (
    <main style={{ maxWidth: 560, margin: "15vh auto", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
      <h1>{heading}</h1>
      <p>{children}</p>
      <p>
        <a href="/library">Back to the library</a>
      </p>
    </main>
  );
}

export default async function ReadPage({ params }: PageProps) {
  const { slug } = await params;
  const outcome = await readerAccess(slug);
  if (!outcome.ok) {
    if (outcome.error.code === "gone") return <Notice heading="This title has been removed">It is no longer available in the library.</Notice>;
    if (outcome.error.code === "forbidden") return <Notice heading="Online reading is not available">The rights holder has not allowed reading this title online.</Notice>;
    notFound();
  }
  const { access } = outcome;
  return (
    <PdfReader
      slug={access.slug}
      title={access.title}
      fileUrl={access.fileUrl}
      downloadUrl={access.downloadUrl}
      externalSourceUrl={access.externalSourceUrl}
      backHref="/library"
    />
  );
}
