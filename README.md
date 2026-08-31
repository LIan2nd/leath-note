# Leath Notes

A personal notepad web application with a **skeuomorphic design** aesthetic. It mimics the look and feel of a physical leather-bound notebook — complete with a wood-textured desktop background, a leather sidebar, and lined paper for the note editor.

## Inspiration

Leath Notes was inspired by the clean, writing-first experience of [Memo Notepad](https://www.memonotepad.com/). It keeps that immediate paper-on-desk feeling while adding reliable account access, folders, autosave, sharing, and optional AI assistance. Leath Notes is an independent project created by [Alfian Nur Usyaid (Liand)](https://portfolio.liand.web.id/).

![Tech Stack](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)

## Features

- **Notes CRUD** — Create, view, edit, and delete personal notes
- **Auto-save** — Notes are saved automatically with a 1-second debounce
- **Folders** — Organize notes into folders with drag-and-drop support
- **AI Chat** — Built-in AI assistant panel with multiple provider support (Ollama, OpenAI, Gemini, Anthropic, OpenRouter)
- **Authentication** — Credentials and optional Google OAuth via NextAuth.js
- **Guest Mode** — Try the notepad without signing in
- **Responsive** — Collapsible sidebar, mobile-friendly drawer
- **Keyboard Shortcuts** — Quick actions for power users

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (Radix) |
| API | tRPC v11 + TanStack Query v5 |
| Database | PostgreSQL + Prisma 6 |
| Auth | NextAuth.js v5 (beta) |
| AI | Multi-provider (Ollama, OpenAI, Gemini, Anthropic, OpenRouter) |
| Testing | Vitest, Testing Library, fast-check |
| Language | TypeScript 5 (strict mode) |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL running locally (or remote)
- npm 11+

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd leath-note

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Environment Variables

Edit `.env` with your values:

```env
# Database
DATABASE_URL="postgresql://postgres:root@localhost:5432/leath-note"

# Auth (generate with: npx auth secret)
AUTH_SECRET="your-secret-here"
AUTH_TRUST_HOST="true" # Required when self-hosting
AUTH_GOOGLE_ID="your-google-client-id"
AUTH_GOOGLE_SECRET="your-google-client-secret"

# Google Search Console HTML-tag verification content (optional)
GOOGLE_SITE_VERIFICATION=""

# AI (optional — defaults to local Ollama)
OLLAMA_HOST="http://localhost:11434"
OLLAMA_MODEL="llama3.2"

# Only needed when running the optional database seed
SEED_OWNER_EMAIL="owner@example.com"
SEED_OWNER_PASSWORD="use-a-strong-unique-password"
```

### Database Setup

```bash
# Push schema to database (quick dev iteration)
npm run db:push

# Or create a migration
npm run db:generate
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run preview` | Build + start in one command |
| `npm run db:push` | Push schema changes (dev only) |
| `npm run db:generate` | Create + apply migration |
| `npm run db:migrate` | Apply existing migrations |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run test` | Run tests |
| `npm run typecheck` | Type check with tsc |

## Search indexing

After deploying the production site:

1. Add `https://leath-note.vercel.app` as a URL-prefix property in Google Search Console.
2. Copy the HTML-tag verification `content` value into `GOOGLE_SITE_VERIFICATION` in the production environment and redeploy.
3. Submit `https://leath-note.vercel.app/sitemap.xml` in Search Console.
4. Inspect the homepage URL and request indexing after the deployment is live.

The app generates its canonical URL, crawler directives, sitemap, and structured data from `src/lib/site-config.ts`.

## Project Structure

```
src/
├── app/                    # Next.js App Router (pages & API routes)
├── components/
│   ├── layout/             # Main layout components (sidebar, notepad, AI panel)
│   ├── auth/               # Authentication components
│   └── ui/                 # shadcn/ui primitives
├── server/
│   ├── api/routers/        # tRPC routers (notes, folders, chat)
│   ├── auth/               # NextAuth config
│   └── db.ts               # Prisma client singleton
├── trpc/                   # tRPC client setup
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities
└── styles/                 # Global CSS with skeuomorphic theme
```

## Design

The UI is intentionally skeuomorphic:

- 🪵 Wood texture desktop background
- 📒 Leather-textured sidebar
- 📝 Lined paper notepad with red margin line
- ⌨️ Typewriter font (Courier Prime) for note content
- 🔘 Embossed/debossed button effects

## License

Private project.
