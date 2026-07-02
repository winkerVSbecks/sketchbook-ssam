---
name: Sketchbook (ssam)
description: Gallery-quiet chrome for a generative-art archive — the sketches supply all the color
colors:
  gallery-white: "#ffffff"
  ink: "#111111"
  pencil: "#888888"
  hairline: "#00000014"
  unprimed: "#f4f4f3"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    letterSpacing: "-0.005em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.04em"
    fontFeature: "tabular-nums"
rounded:
  none: "0px"
  code: "3px"
spacing:
  caption: "0.2rem"
  inline: "0.5rem"
  caption-top: "0.75rem"
  heading: "1.5rem"
  page: "2rem"
  section: "4rem"
  masthead: "5rem"
components:
  year-header:
    backgroundColor: "{colors.gallery-white}"
    textColor: "{colors.pencil}"
    typography: "{typography.label}"
    padding: "1rem 0 0.75rem"
  thumb-image:
    backgroundColor: "{colors.unprimed}"
    rounded: "{rounded.none}"
  meta-link:
    textColor: "{colors.ink}"
  icon-button:
    textColor: "{colors.pencil}"
  icon-button-hover:
    textColor: "{colors.ink}"
---

# Design System: Sketchbook (ssam)

## 1. Overview

**Creative North Star: "The Flat File"**

The artist's flat-file drawer: prints stored systematically, labeled in pencil, retrieved by date. This is a working archive, not an exhibition — chronology over curation, completeness over spectacle. The chrome exists to hold the work flat and findable, then get out of the way. Every visible decision (white ground, hairline dividers, pencil-gray labels, square prints on a uniform grid) comes from that drawer, not from web-portfolio convention.

The system is deliberately voiceless where the work is loud. The interface owns no hue, no shadow, no display typeface — the ~105 sketches supply all the color and all the personality on any page. Density is generous but systematic: one grid rule (`repeat(auto-fill, minmax(280px, 1fr))`, 4rem gutters) applied uniformly, the same anti-compositional stance the sketches themselves take. It explicitly rejects the generative-art genre look (dark neon, glitch, terminal chrome), the template portfolio (heroes, badges, eyebrow labels), social-feed dynamics (masonry, infinite scroll), and art-world solemnity (splash screens, ubiquitous fade-ins).

**Key Characteristics:**
- Achromatic chrome; all color is borrowed from the artwork
- One systematic grid, square 1:1 prints, uniform 4rem gutters
- System font stack — no typographic voice competing with the work
- Hairlines (1px, 8% black) as the only structural line
- Metadata set in pencil-gray with tabular numerals
- Refined and restrained interaction: quiet at rest, legible on touch

## 2. Colors

Five achromatic values, named for studio materials; the palette's entire job is to disappear behind the sketches.

### Primary
- **Ink** (#111111): All reading text — the masthead, sketch names, links. The color of anything that must be read, and the hover destination for every interactive element.

### Neutral
- **Gallery White** (#ffffff): The ground. Body background, sticky year-header backing. Pure white, never tinted — any warmth would argue with the sketches.
- **Pencil** (#888888): Metadata only — dates, sketch counts, year markers, resting icon states. The label written lightly in the drawer's corner. Never used for body prose.
- **Hairline** (rgba(0,0,0,0.08) / #00000014): The 1px structural line — year-header underline, resting link underlines. The only divider the system owns.
- **Unprimed** (#f4f4f3): Image placeholder ground while thumbnails load, and inline-code background. The unpainted canvas beneath a print.

### Named Rules
**The Borrowed Color Rule.** The interface owns no hue. Every drop of color on any page arrives inside a sketch thumbnail. Introducing a chromatic accent into the chrome — even one — is prohibited.

**The Pencil Rule.** Pencil (#888888) is a metadata voice, not a text color. Dates, counts, year markers, resting icons: yes. Sentences someone must read: never — those are Ink.

## 3. Typography

**Display Font:** System stack (-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)
**Body Font:** Same system stack
**Label Font:** Same, with `font-variant-numeric: tabular-nums`

**Character:** One family, native to the machine, chosen precisely because it has no voice of its own. Hierarchy is carried entirely by size, weight (400/500/600), and the Ink/Pencil color split — never by a second typeface.

### Hierarchy
- **Display** (600, 2.25rem, -0.02em): The masthead "Sketchbook" only. One per page.
- **Title** (500, 0.9375rem, -0.005em): Sketch names in captions. Single line, ellipsized — the drawer label, not a headline.
- **Body** (400, 15px, 1.5): Prose and the empty state. Always Ink.
- **Label** (500, 0.8125rem, +0.04em, tabular-nums): Sticky year markers. Related metadata voices: `.meta` byline at 0.875rem, `.date` at 0.75rem — all Pencil, all tabular.

### Named Rules
**The Tabular Rule.** Every numeral in the interface — dates, years, counts — is set `tabular-nums`. Numbers in an archive are data; they align in columns.

## 4. Elevation

Flat, absolutely. There is not a single `box-shadow` in the system and none may be added. Depth is conveyed two ways only: the 1px Hairline where structure needs a line, and the sticky year header, whose solid Gallery White backing (with a backdrop blur as it passes over thumbnails) is the system's one act of layering. Prints in a flat file don't cast shadows.

### Named Rules
**The Hairline Rule.** If a boundary needs marking, it gets a 1px hairline (rgba(0,0,0,0.08)). Not a shadow, not a background shift, not a thicker border.

## 5. Components

Refined and restrained: visible but polite, readable at rest, subtle emphasis on interaction. Hover states shift along existing axes (opacity, Pencil→Ink) — nothing moves, grows, or glows.

### Thumb Card (signature component)
- **Structure:** Square thumbnail link above a caption block; no box, no border, no card surface — the print IS the card.
- **Image:** 1:1 aspect, `object-fit: cover`, Unprimed (#f4f4f3) ground while loading, `loading="lazy"`, corners square (0px).
- **Hover:** Whole image eases to 65% opacity (0.2s ease) — lifting the print slightly off the stack.
- **Caption:** 0.75rem above; name (Title style, ellipsized) with icon actions right-aligned on the same row, date (0.75rem Pencil, tabular) beneath.

### Year Header
- **Style:** Sticky at top (z-index 10), Label typography in Pencil, Gallery White backing, Hairline underline, `backdrop-filter: saturate(180%) blur(8px)`.
- **Role:** The drawer divider — it indexes, it never announces.

### Links (meta / prose)
- **Style:** Ink text, underlined; the underline sits at Hairline strength, offset 3px.
- **Hover:** Underline darkens to Ink. The text itself never changes color.

### Icon Buttons
- **Style:** 14px stroke icons (inline SVG, 2px stroke, round caps), Pencil at rest.
- **Hover:** Color eases to Ink (0.15s). No background, no circle, no tooltip chrome; `aria-label` carries the name.

### Empty State
- **Style:** One Pencil sentence with the fix inline as code (Unprimed background, 3px radius — the system's only rounded corner). No illustration, no sad icon.

### Dev Gallery Cell (secondary surface — product register)
- **Style:** `gallery.html` runs dark (#111 page, #000 cells, #eee text) because live sketches render against black in a screen context. Square iframe cells, 12px gutters, bottom overlay label (11px, 65% black scrim). Utilitarian by design; it borrows nothing from the archive system except restraint.

## 6. Do's and Don'ts

### Do:
- **Do** edit `renderCss()` / `renderHtml()` in `scripts/archive-render-html.ts`, then run `npm run archive:site`. `archive/style.css` and `archive/index.html` are generated output — direct edits will be overwritten.
- **Do** keep every numeral tabular (The Tabular Rule) and every metadata voice in Pencil (The Pencil Rule).
- **Do** keep thumbnails square (1:1, `object-fit: cover`, 400×400 Cloudinary transform) and corners at 0px everywhere except inline code (3px).
- **Do** hold hover states to the two sanctioned moves: image opacity → 0.65, icon/underline Pencil → Ink.
- **Do** keep the grid rule uniform: `repeat(auto-fill, minmax(280px, 1fr))` with 4rem gutters, applied identically to every year section.

### Don't:
- **Don't** introduce any hue into the chrome — no accent color, ever (The Borrowed Color Rule). PRODUCT.md: "Color belongs to the work."
- **Don't** reach for **creative-coder maximalism** — dark neon backgrounds, glitch/CRT/terminal aesthetics, cursor trails. The archive stays Gallery White.
- **Don't** build **template-portfolio** grammar — hero sections, card surfaces with borders and shadows, badges, eyebrow labels. The thumb card has no box; keep it that way.
- **Don't** add **social-feed dynamics** — masonry layouts, infinite scroll, view counts, engagement chrome. Year sections with a uniform grid, nothing else.
- **Don't** indulge **art-world pretension** — splash screens, slow fade-ins on everything, scroll-jacking. Content is visible immediately; motion stays at the two hover transitions.
- **Don't** add box-shadows, gradients, or glassmorphism. If a boundary needs marking, it's a 1px hairline (The Hairline Rule).
- **Don't** set body prose in Pencil (#888888) — it fails readable contrast and violates the Pencil Rule; prose is Ink.
- **Don't** add a second typeface or a webfont. The system stack's silence is the choice.
