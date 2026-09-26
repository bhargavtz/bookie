# Contributing to Bookie

Thanks for helping improve Bookie. Contributions should keep the project focused as a small, accessible Next.js portfolio experience.

## Before you start

1. Check existing issues and pull requests for related work.
2. For larger changes, open an issue first so the scope can be agreed.
3. Do not commit credentials, private content, build output, or dependency directories.

## Local development

```bash
npm ci
npm run dev
```

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Pull requests

- Use a focused branch, such as `feat/accessible-navigation` or `fix/image-alt-text`.
- Explain what changed and why.
- Include screenshots or a short screen recording for visual changes.
- Call out accessibility, responsive-layout, or performance considerations.
- Keep unrelated formatting changes out of the pull request.

## Commit and review expectations

Use clear imperative commit messages. Reviewers will check behavior, TypeScript correctness, responsive presentation, accessibility, and that no secrets or generated dependencies were added.
