# Bookie

Bookie is a polished reading-platform landing page built with Next.js and TypeScript. It presents a responsive library experience with featured books, category discovery, reading benefits, and a newsletter form in a single-page interface.

> **Status:** Frontend concept / portfolio project. The repository currently contains presentation UI only; the newsletter form is not connected to a mailing service or backend.

![Bookie landing page artwork](public/reading-book-illustration.jpg)

## Highlights

- Responsive single-page reading experience
- Hero, featured books, categories, benefits, newsletter, and about sections
- Smooth in-page navigation and scroll-triggered GSAP animations
- Local image assets rendered with `next/image`
- Modern Next.js App Router and TypeScript setup

## Tech stack

- [Next.js](https://nextjs.org/) 15
- React 19
- TypeScript
- GSAP with ScrollTrigger
- Tailwind CSS v4 PostCSS integration

## Run locally

### Prerequisites

- Node.js 20 or newer recommended
- npm 10 or newer

### Setup

```bash
git clone https://github.com/bhargavtz/bookie.git
cd bookie
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server with Turbopack |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build locally |
| `npm run lint` | Run ESLint across the project |
| `npm run typecheck` | Run TypeScript without emitting files |

## Project structure

```text
src/app/             App Router entrypoint, metadata, and global styles
src/components/      Sections that make up the landing page
public/              Local illustrations and image assets
```

## Contributing

Small improvements and focused fixes are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Please see [SECURITY.md](SECURITY.md) for responsible disclosure guidance.

## License

No license file is currently included in this repository. Unless a license is added, the source is not licensed for reuse beyond the permissions granted by applicable law.

## Maintainer

[Bhargavtz](https://github.com/Bhargavtz)
