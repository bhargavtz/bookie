/**
 * Structurally required taxonomy (NOT book data). Inserted idempotently by
 * `npm run db:bootstrap`; existing rows are never overwritten so admin edits
 * survive. Edit this list to change the bootstrap taxonomy.
 *
 * NOTE: the project brief's exact 15-category list was not available to S1
 * (2026-11-11); these names are a placeholder programming/CS taxonomy to be
 * reconciled with the brief by the owner.
 */
export type ReferenceCategory = { slug: string; name: string; description: string; iconKey: string };

export const REFERENCE_CATEGORIES: readonly ReferenceCategory[] = [
  { slug: "algorithms-data-structures", name: "Algorithms and Data Structures", description: "Algorithm design, analysis and core data structures.", iconKey: "algorithms" },
  { slug: "programming-languages", name: "Programming Languages", description: "Language references and language design.", iconKey: "code" },
  { slug: "web-development", name: "Web Development", description: "Front-end, back-end and full-stack web engineering.", iconKey: "globe" },
  { slug: "mobile-development", name: "Mobile Development", description: "Native and cross-platform mobile apps.", iconKey: "smartphone" },
  { slug: "databases", name: "Databases", description: "Relational, document and distributed data stores.", iconKey: "database" },
  { slug: "operating-systems", name: "Operating Systems", description: "Kernels, processes, memory and file systems.", iconKey: "cpu" },
  { slug: "computer-networks", name: "Computer Networks", description: "Protocols, networking and distributed communication.", iconKey: "network" },
  { slug: "software-engineering", name: "Software Engineering", description: "Design, architecture, testing and process.", iconKey: "layers" },
  { slug: "devops-cloud", name: "DevOps and Cloud", description: "Infrastructure, delivery and operations.", iconKey: "cloud" },
  { slug: "security-cryptography", name: "Security and Cryptography", description: "Application security and applied cryptography.", iconKey: "shield" },
  { slug: "artificial-intelligence", name: "Artificial Intelligence", description: "Machine learning, deep learning and AI systems.", iconKey: "brain" },
  { slug: "data-science", name: "Data Science", description: "Statistics, analytics and data engineering.", iconKey: "chart" },
  { slug: "theory-of-computation", name: "Theory of Computation", description: "Automata, complexity and formal methods.", iconKey: "sigma" },
  { slug: "systems-embedded", name: "Systems and Embedded", description: "Low-level, embedded and real-time systems.", iconKey: "chip" },
  { slug: "graphics-game-development", name: "Graphics and Game Development", description: "Computer graphics, game engines and simulation.", iconKey: "gamepad" },
] as const;
