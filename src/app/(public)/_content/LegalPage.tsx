import Link from "next/link";
import { LICENSE_TYPES } from "@/contracts/enums";
import { LICENSE_LABELS } from "@/components/books/links";
import { PageHeading, PageShell } from "@/components/home/PageShell";
import { ContactAddress, Prose, ProseSection } from "@/components/home/Prose";
import type { Block, Inline, LegalDocument } from "./legal";

export function Inlines({ parts }: { parts: readonly Inline[] }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : "href" in part ? (
          <Link key={index} href={part.href}>
            {part.text}
          </Link>
        ) : (
          <strong key={index}>{part.strong}</strong>
        ),
      )}
    </>
  );
}

function BlockView({ block, email }: { block: Block; email: string | undefined }) {
  switch (block.kind) {
    case "p":
      return (
        <p>
          <Inlines parts={block.parts} />
        </p>
      );
    case "list":
      return (
        <ul className="list-disc pl-6">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "licenseTypes":
      return (
        <ul className="list-disc pl-6">
          {LICENSE_TYPES.map((type) => (
            <li key={type}>{LICENSE_LABELS[type] ?? type}</li>
          ))}
        </ul>
      );
    case "contact":
      return <ContactAddress email={email} />;
  }
}

/** Renders one document from the content module. `email` is the configured contact address, if any. */
export function LegalPage({ document, path, email }: { document: LegalDocument; path: string; email: string | undefined }) {
  return (
    <PageShell currentPath={path}>
      <PageHeading eyebrow={document.eyebrow} title={document.title} />
      <Prose>
        {document.sections.map((section) => (
          <ProseSection key={section.id} id={section.id} title={section.title}>
            {section.blocks.map((block, index) => (
              <BlockView key={index} block={block} email={email} />
            ))}
          </ProseSection>
        ))}
      </Prose>
    </PageShell>
  );
}
