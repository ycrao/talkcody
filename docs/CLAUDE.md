# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a documentation site for TalkCody, built with Next.js and Fumadocs. It provides MDX-based documentation with full-text search, syntax highlighting, and customizable layouts.

**Technology Stack:**
- Framework: Next.js 16
- Documentation: Fumadocs (fumadocs-core, fumadocs-mdx, fumadocs-ui)
- Language: TypeScript
- Styling: Tailwind CSS 4
- Package Manager: npm/pnpm/yarn (Bun is used in parent project)

## Common Commands

```bash
# Development
bun run dev              # Start dev server at http://localhost:3000

# Build and Production
bun run build            # Build for production
npbunm run start            # Start production server

# Code Quality
bun run lint             # Check code with Biome
bun run format           # Format code with Biome
bunx biome format --write  # Format all files

# Post-install
bun run postinstall      # Runs fumadocs-mdx (automatically after npm install)
```

## Architecture

### Content Source System

The documentation content is managed through a **source adapter** pattern:

1. **source.config.ts**: Defines MDX collections and schemas
   - Configures `content/docs` as the documentation directory
   - Sets frontmatter and meta.json schemas
   - Enables processed markdown output via `includeProcessedMarkdown: true`

2. **lib/source.ts**: Content loader and utilities
   - `source`: Main loader instance using fumadocs-core
   - Base URL set to `/docs`
   - Includes lucide-icons plugin for icon support
   - `getPageImage()`: Generates OG image URLs
   - `getLLMText()`: Extracts processed markdown for LLM consumption

3. **lib/layout.shared.tsx**: Shared layout configuration options

### Route Structure

| Route | Purpose |
|-------|---------|
| `app/(home)` | Landing page and non-docs pages |
| `app/docs` | Documentation layout and MDX pages |
| `app/api/search/route.ts` | Search API endpoint |

### Content Organization

- MDX files are stored in `content/docs/`
- Each page can have frontmatter metadata
- Directories can include `meta.json` for navigation configuration
- Processed markdown is available for search indexing and LLM features

## Development Notes

### Adding Documentation

1. Create MDX files in `content/docs/`
2. Use frontmatter for page metadata (title, description, etc.)
3. Update `meta.json` for navigation structure if needed
4. The fumadocs-mdx plugin auto-processes files during build

### Search Functionality

The search is powered by Fumadocs' built-in search API at `app/api/search/route.ts`. It indexes the processed markdown content.

### OG Images

Open Graph images are auto-generated at `/og/docs/{...slugs}/image.png` using the `getPageImage()` utility.

## Relationship to Parent Project

This docs site is a subdirectory of the TalkCody desktop application (../). The parent project is a Tauri 2 + React desktop app. These are separate codebases with different package.json files and dependencies.
