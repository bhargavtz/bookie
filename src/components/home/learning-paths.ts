/**
 * Curated learning paths. Only the structure is written here: each step names a
 * category slug, and the step's label, link and book count come from the
 * database at render time. A step whose category does not exist is dropped, and
 * a path with no steps left is not shown. No book is named here.
 */
export type LearningPathDefinition = {
  id: string;
  title: string;
  summary: string;
  categorySlugs: readonly string[];
};

export const LEARNING_PATHS: readonly LearningPathDefinition[] = [
  {
    id: "web",
    title: "Build for the web",
    summary: "Start with a language, then the web platform, data and security.",
    categorySlugs: ["programming-languages", "web-development", "databases", "security-cryptography"],
  },
  {
    id: "foundations",
    title: "Computer science foundations",
    summary: "The ideas underneath every program: algorithms, theory, systems and networks.",
    categorySlugs: ["algorithms-data-structures", "theory-of-computation", "operating-systems", "computer-networks"],
  },
  {
    id: "engineering",
    title: "Ship and run software",
    summary: "Design, test, deploy and operate real systems.",
    categorySlugs: ["software-engineering", "devops-cloud", "databases", "computer-networks"],
  },
  {
    id: "data",
    title: "Data and machine learning",
    summary: "Statistics and data work first, then machine learning.",
    categorySlugs: ["data-science", "artificial-intelligence", "algorithms-data-structures"],
  },
];

export type ResolvedLearningPath = {
  id: string;
  title: string;
  summary: string;
  steps: Array<{ slug: string; name: string; bookCount: number }>;
};

type CategoryLike = { slug: string; name: string; bookCount: number };

export function resolveLearningPaths(
  definitions: readonly LearningPathDefinition[],
  categories: readonly CategoryLike[],
): ResolvedLearningPath[] {
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  return definitions
    .map((definition) => ({
      id: definition.id,
      title: definition.title,
      summary: definition.summary,
      steps: definition.categorySlugs.flatMap((slug) => {
        const category = bySlug.get(slug);
        return category === undefined ? [] : [{ slug, name: category.name, bookCount: category.bookCount }];
      }),
    }))
    .filter((path) => path.steps.length > 0);
}
