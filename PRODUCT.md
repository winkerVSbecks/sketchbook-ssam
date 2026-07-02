# Product

## Register

brand

## Users

Primarily Varun himself — a generative artist working through ideas in code. Two contexts:

- **Sketching** (daily): running a single sketch via the Vite dev server, or scanning many at once in `gallery.html`. Speed of iteration is everything; the tools are scaffolding.
- **Browsing the record** (weekly-ish): opening the archive site to revisit past work, find a piece, or share a link. A personal record first; public visibility is incidental but the page should hold up when a peer lands on it.

Register split: the **archive site** (`archive/index.html`) is the brand surface and this file's default register. Dev tooling (`gallery.html`, the sketch runner `index.html`) is **product** register — override per task.

## Product Purpose

A personal generative-art sketchbook built on ssam (~105 sketches: canvas, shaders, WebGPU, pen-plotter work). The repo is the studio; the archive is the record. `npm run archive` renders each sketch to a PNG, uploads to Cloudinary, and regenerates a static, chronological, year-grouped page from `archive.json`.

Success looks like: sketching stays frictionless, and the archive presents the work honestly — complete, dated, findable — without the presentation ever becoming the point.

## Brand Personality

Quiet, precise, systematic. Gallery-quiet: white-cube restraint where the chrome disappears and the sketches are the only color and voice. The interface extends the project's art philosophy — digital minimalism, specific objects, anti-compositional method (Judd, Kelly, LeWitt) — rather than commenting on it. Emotional goal on landing: calm, unhurried looking.

## Anti-references

- **Creative-coder maximalism** — dark neon backgrounds, glitch/CRT/terminal aesthetics, cursor trails. The default genre look for generative-art sites; explicitly not this.
- **Template portfolio** — hero sections, card grids with badges, eyebrow labels, testimonial grammar. Nothing here is being sold.
- **Social-feed dynamics** — masonry walls, infinite scroll, engagement chrome. The work is a record, not content.
- **Art-world pretension** — splash screens, slow fade-ins on everything, scroll-jacking. Solemnity as decoration is still decoration.

## Design Principles

1. **The chrome disappears.** Every interface decision defers to the sketches. If an element competes with the art for attention, remove it or mute it.
2. **Color belongs to the work.** Interface surfaces stay achromatic — white, ink, hairlines. The sketches supply all the color on any page.
3. **Systematic, like the art.** Grids, tabular numerals, consistent rhythm. Arrangement comes from rules applied uniformly, not per-page taste — the same anti-compositional stance the sketches take.
4. **A record, not a pitch.** Chronology over curation. Dates, completeness, and findability are the point; never persuade.
5. **Tools stay fast.** Dev surfaces (gallery, runner) optimize for iteration speed and legibility at a glance; function decides every trade-off.

## Accessibility & Inclusion

Best effort, no formal WCAG audit. Concretely: body text keeps real contrast (no decorative light-gray prose), links and controls stay keyboard-usable, motion — where it exists at all — honors `prefers-reduced-motion`, and archive images carry their sketch id as alt text.
