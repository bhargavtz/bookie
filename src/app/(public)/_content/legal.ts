/**
 * All copy for the legal and rights pages (/about, /copyright, /licensing,
 * /privacy, /contact, /takedown) lives here. Pages render it through
 * `LegalPage`; nothing in this file is shown except the strings themselves.
 *
 * Accuracy rule: each statement below describes what the code does today
 * (reviewed 2026-11-11 against the working tree on top of c6e855b). When the
 * behaviour changes, change the sentence in the same commit.
 *
 * LEGAL REVIEW markers (comments like this one, never rendered): a lawyer must
 * read the whole file before launch. This file is a statement of facts about
 * the software, not legal advice, and it is not a substitute for terms of use,
 * a data-protection notice or a designated-agent / notice-and-takedown policy.
 */

export type Inline = string | { href: string; text: string } | { strong: string };
export type Block =
  | { kind: "p"; parts: Inline[] }
  | { kind: "list"; items: string[] }
  /** Renders the licence types from the database enum so the list cannot drift from the code. */
  | { kind: "licenseTypes" }
  | { kind: "contact" };
export type Section = { id: string; title: string; blocks: Block[] };
export type LegalDocument = { eyebrow: string; title: string; metaTitle: string; description: string; sections: Section[] };

const p = (...parts: Inline[]): Block => ({ kind: "p", parts });

export const ABOUT: LegalDocument = {
  eyebrow: "About",
  title: "A better place to learn how technology works.",
  metaTitle: "About",
  description: "What Bookie is and how its library works.",
  sections: [
    {
      id: "what",
      title: "What Bookie is",
      blocks: [
        p(
          "Bookie is a digital library of programming and computer science books with a reader built into the browser. You can search by title, author and topic, browse by category and collection, and read a book without leaving the page.",
        ),
      ],
    },
    {
      id: "rights",
      title: "How titles get into the library",
      blocks: [
        // Code: canPublish requires a licence, rights holder, an approver and a source URL or evidence note.
        p(
          "A book is published only after an administrator has recorded its licence, its rights holder and either a source link or a note of the evidence reviewed. Whether a title can be read online or downloaded is decided separately for each book, on the server, every time it is requested. A book without an approved or restricted licence record is not shown at all.",
        ),
        p("Each book page shows the licence details held for that title. Read ", { href: "/licensing", text: "how licensing works" }, ", or see ", { href: "/copyright", text: "the copyright statement" }, "."),
      ],
    },
    {
      id: "problem",
      title: "Found something that should not be here?",
      blocks: [p("Rights holders can ask for a title to be removed with the ", { href: "/takedown", text: "takedown form" }, ". The ", { href: "/contact", text: "contact page" }, " explains what happens next.")],
    },
  ],
};

export const COPYRIGHT: LegalDocument = {
  eyebrow: "Legal",
  title: "Copyright",
  metaTitle: "Copyright",
  description: "Who owns the books in the Bookie library and how to report a problem.",
  sections: [
    {
      id: "ownership",
      title: "Ownership",
      blocks: [
        p(
          "Each title in the library remains the property of its author, publisher or other rights holder. Listing a book here does not transfer or grant any right in it. The rights holder and licence recorded for a title are shown on its book page when they have been recorded.",
        ),
      ],
    },
    {
      id: "use",
      title: "Using a book",
      blocks: [
        p(
          "Read or download a title only where its book page offers that action, and only within the terms of its licence. Details are on the ",
          { href: "/licensing", text: "licensing page" },
          ".",
        ),
      ],
    },
    {
      id: "report",
      title: "Reporting an infringement",
      blocks: [
        // LEGAL REVIEW: no designated DMCA agent, counter-notice procedure or statutory response time is implemented. Counsel must decide whether those are needed for the operating jurisdiction before launch.
        p("If you hold the rights to a title and believe it should not be listed, use the ", { href: "/takedown", text: "takedown form" }, ". The steps that follow are described on the ", { href: "/contact", text: "contact page" }, "."),
        { kind: "contact" },
      ],
    },
  ],
};

export const LICENSING: LegalDocument = {
  eyebrow: "Legal",
  title: "Licensing",
  metaTitle: "Licensing",
  description: "How Bookie records licences and decides what can be read or downloaded.",
  sections: [
    {
      id: "records",
      title: "Licence records",
      blocks: [
        p(
          "Every listed book has a licence record kept by the library: the licence type, the rights holder, any attribution text, a link to the licence terms and the source where there is one, and a note of the evidence reviewed. An administrator approves that record before the book is published.",
        ),
        p("The licence types the library records are:"),
        { kind: "licenseTypes" },
      ],
    },
    {
      id: "access",
      title: "What a licence allows",
      blocks: [
        // Code: policy.canRead/canDownload; restricted licences never allow download (src/lib/policy).
        p(
          "Reading online and downloading are separate permissions on each licence. The server checks them on every request, and a button on a book page appears only when the action is allowed for that title. A title with a restricted licence is never offered for download; it can be read online only where its licence allows reading.",
        ),
        // LEGAL REVIEW: the sentence below disclaims any grant of rights; counsel should confirm wording.
        p("The library does not claim that a title is licensed unless its book page shows a licence record. Nothing on this page grants you any right in a book."),
      ],
    },
    {
      id: "takedown",
      title: "Disputing a licence",
      blocks: [
        p(
          "If you hold the rights to a title and its record is wrong, send a request through the ",
          { href: "/takedown", text: "takedown form" },
          ". Requests are reviewed by an administrator. If a request is upheld, the book is removed (see the ",
          { href: "/contact", text: "contact page" },
          ").",
        ),
        { kind: "contact" },
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  eyebrow: "Legal",
  title: "Privacy",
  metaTitle: "Privacy",
  description: "What Bookie stores about readers.",
  sections: [
    {
      id: "accounts",
      title: "No reader accounts",
      blocks: [p("Reading and browsing need no account. Bookie does not ask readers to sign in and does not set cookies for readers. Cookies are used only for the administrator sign-in.")],
    },
    {
      id: "device",
      title: "Stored on your device",
      blocks: [
        p(
          "Your reading position, page bookmarks, reader settings and book bookmarks are kept in your browser's local storage on your device. They are not sent to the server. Clearing site data removes them.",
        ),
      ],
    },
    {
      id: "server",
      title: "What the server records",
      blocks: [
        // Code: serve.ts records download events (served / denied) with ip_hash (null unless TRUST_PROXY=true), ua family and referrer host; the hash salt includes the UTC date so it changes daily.
        // LEGAL REVIEW: a salted hash of an IP address may still be personal data (GDPR). No retention period or purge job is implemented; the owner must choose a retention rule and a legal basis.
        p(
          "When you request a download, the server records the time, the book, whether it was served or refused, the family of your browser (for example \"firefox\"), the website you came from (host name only) and, when the site runs behind a trusted proxy, a salted hash of your network address. The hash changes every day, and the address itself is not stored.",
        ),
        p("Requests are also counted to limit abuse. Those counters use the same kind of hash, or a shared counter when no address is available. No fixed period for deleting these records has been set."),
        p("Bookie does not load analytics, advertising or other third-party scripts."),
      ],
    },
    {
      id: "takedown",
      title: "Takedown requests",
      blocks: [
        p(
          "If you submit a ",
          { href: "/takedown", text: "takedown request" },
          ", the name, email address, organisation, relationship to the work, page address, statement, signature and good-faith confirmation you enter are stored so that the request can be reviewed, together with a salted hash of your network address when one is available. Administrators can read these.",
        ),
      ],
    },
  ],
};

export const CONTACT: LegalDocument = {
  eyebrow: "Company",
  title: "Contact",
  metaTitle: "Contact",
  description: "How to contact Bookie and how to ask for a title to be removed.",
  sections: [
    { id: "general", title: "General questions", blocks: [{ kind: "contact" }] },
    {
      id: "takedown",
      title: "Asking for a title to be removed",
      blocks: [
        p("If you hold the rights to a book in the library and want it removed, send a takedown request through the ", { href: "/takedown", text: "takedown page" }, ". A request records:"),
        {
          kind: "list",
          items: [
            "who you are, your organisation if any, and your relationship to the work;",
            "the address of the book page and a description of the problem;",
            "a confirmation that you are acting in good faith, and your signature.",
          ],
        },
        p("What happens next: the request is added to a review queue and starts as ", { strong: "open" }, ". An administrator moves it to ", { strong: "under review" }, ", and then to ", { strong: "upheld" }, ", ", { strong: "rejected" }, " or ", { strong: "withdrawn" }, "."),
        p(
          "If a request is upheld, the book is removed in a single step: its licence is marked removed and it is unpublished. Its book page, reader and download links stop working on the next request, and the page then reports that the title was removed. Lists on the home page and in collections are cached for up to one minute, so a removed title can remain in them for that long. The stored file is not deleted automatically. No response time is promised on this page.",
        ),
      ],
    },
  ],
};

export const TAKEDOWN = {
  eyebrow: "Legal",
  title: "Takedown requests",
  metaTitle: "Takedown requests",
  description: "Ask for a title to be reviewed or removed from the Bookie library.",
  intro: [
    p(
      "Use this form if you hold the rights to a book in the library, or act for someone who does, and you want it reviewed or removed. Your statement is read by an administrator. See the ",
      { href: "/contact", text: "contact page" },
      " for what happens to a request.",
    ),
    p("Submitting a request does not confirm that a book exists or is listed. You will see the same acknowledgement either way."),
  ],
  disabled: "Takedown requests cannot be submitted through this form until a contact address has been configured for the site.",
  acknowledgement: "Thank you. Your request has been received and will be reviewed. No decision is implied by this message.",
  rateLimited: "Too many requests were sent. Please wait a while and try again.",
  failed: "The request could not be sent. Please try again later.",
} as const;
