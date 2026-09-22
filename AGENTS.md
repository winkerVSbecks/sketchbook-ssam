# AGENTS.md

The contract for working in this repo. [CLAUDE.md](./CLAUDE.md) is the detailed
guide — what the tools are, how the archive, atlas and colour systems work.
This file is what you must do.

## Verify before every commit

```sh
npm run test && npm run typecheck
```

That is the whole ritual. `test` runs every Node smoke suite in `scripts/`
(discovered by filename: `scripts/*smoke*.ts`) and prints a per-suite table;
`typecheck` is `tsc --noEmit` on the whole tree. Never hand-roll a list of
suites and never grep `tsc` output for "your" files — if either command is
red, the tree is red.

`npm run cloud:smoke` is the one suite not in `test`: it needs Playwright +
Chromium and spawns a dev server. Run it when you touch `scripts/cloud-render.ts`,
`scripts/vite-runner.ts` or the archive renderer.

## Commit each unit as soon as it verifies

The moment a logical unit passes the pair above, commit it. Do not batch
several units into one commit and do not hold verified work for a final
sweep: verified-but-uncommitted work is lost when a session is killed.

## Rendering has side effects outside the working tree

`npm run archive`, `npm run cloud:render` and the archive site's play button
all spawn a **detached** Vite dev server on **:6173** and write
`.cloud-render/vite.pid` (plus `vite.log`). That server outlives the command
that started it.

- **:5173 belongs to the human's `npm run dev`. Never start, stop, probe or
  kill anything on it.**
- The runner only ever signals a process it recorded in
  `.cloud-render/vite.pid`. If :6173 is held by anything else it refuses and
  says so — do not "free the port" yourself.
- `npm run cloud:stop` is the cleanup. Run it when you are done rendering.

## Format with the repo config

```sh
npm run format -- <files you changed>
```

Prettier reads the repo `.prettierrc` (single quotes, semicolons, width 100,
trailing commas). Never run Prettier with its defaults and never reformat
files you did not change. `src/sketches` is ignored on purpose: sketches are
formatted by hand.

## Sketch flows live in skills

The entries in `.claude/skills/` are the source of truth for their flows.
Follow them instead of reconstructing the steps:

| Skill               | Use it when                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `verify-sketch`     | after any change to a sketch — diagnostics plus a rendered frame |
| `render-sketch`     | you need to see what a running sketch looks like                 |
| `create-sketch`     | a new plain ssam sketch                                          |
| `create-ui-sketch`  | a new sketch on the canvas-UI shell (`src/ui`)                   |
| `create-tui-sketch` | a new sketch on the terminal desktop (`src/tui`)                 |
| `fork-sketch`       | a variant of an existing sketch                                  |
| `implement-sketch`  | turning an idea into code in an existing sketch                  |

Run a sketch: `VITE_SKETCH="sketches/<path>" npm run dev`.
