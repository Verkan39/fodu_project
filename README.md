# Tactile *(working title)*

A puzzle game where **writing a correct proof is the same thing as solving the puzzle**.

Built for **Syntax Error 2026** (Oct 23–25), Functional Programming track, Problem Statement 2: *Proof Puzzle*.

## What we're building

You get a grid of coloured blocks and a target picture. You solve a level by writing a short **Lean 4** proof where each line is one move:

```lean
swap 0 2        -- exchange the blocks in cells 0 and 2
paint 4 cyan    -- turn the block in cell 4 cyan
rotate 5        -- turn the block in cell 5 a quarter turn clockwise
```

- **Run** plays the moves back one line at a time, so you can watch the board change.
- An **illegal move** (a cell that doesn't exist, a locked block, a colour not allowed in the level) turns that block red, and the proof fails at that line.
- The level is **cleared** when Lean accepts the proof **and** the board matches the target.
- Later levels let you name a **helper** (a reusable group of moves) and call it. Shorter proofs earn more stars, so reusing helpers pays off.

### How it works

| Part | Tech | Status |
|---|---|---|
| Game rules and proof checking | Lean 4 (core only, no Mathlib) | 🟢 The three moves are done and tested |
| Proof layer: each proof line is a move | Lean 4 tactics | ⚪ Next |
| In-browser simulator for playback | TypeScript (pure functions) | ⚪ Planned |
| Web app | React, Vite, CodeMirror 6 | ⚪ Planned |
| Verify API with a sandboxed Lean runner | Node + TypeScript | ⚪ Planned |
| Packaging | Docker | 🟢 Lean dev image |

The browser simulator gives instant playback, and **real Lean** is the final judge of whether a proof is correct.

## Setup

Lean runs **inside Docker**, so you don't need to install Lean on your machine.

### Requirements

- **Docker** with **Compose v2** (`docker compose version` should work)
- **git**
- **About 2 GB of free disk space** for the Lean image (around 900 MB) plus build output. Keep more free than that for the rest of the project.

### 1. Clone the repo

```bash
git clone <repo-url> tactile
cd tactile
```

### 2. Build the Lean image (first time only)

```bash
docker compose -f docker/compose.yaml build lean
```

This downloads Debian and the Lean toolchain at the version pinned in `lean/lean-toolchain` (currently **v4.35.0**). It takes a few minutes the first time. You only need to run it again if `lean-toolchain` or the Dockerfile changes.

### 3. Compile and run the tests

```bash
docker compose -f docker/compose.yaml run --rm lean lake build
```

This compiles the game library **and** checks every test. The tests are facts that Lean must prove (`example … := by decide`) or programs that must return `true` (`#guard`), so **if any move behaves wrongly, the build fails**. A successful run ends with:

```
Build completed successfully
```

### 4. Run the demo

```bash
docker compose -f docker/compose.yaml run --rm lean lake exe demo
```

It prints the board before and after each move on a sample level. `[ ]` marks a locked cell, letters are colours (A = amber, C = cyan, …), and arrows are facings:

```
── swap, paint, rotate ──
 A↑  C↑  V→
 J↑ [I↓] A←
 C→  V↑  J↑

> swap 0 2
 V→  C↑  A↑
 ...
```

### Optional: a shell inside the container

```bash
docker compose -f docker/compose.yaml run --rm lean bash
# inside the container:
lake build
lake env lean TactileTests.lean    # check one file
```

## Project layout

```
lean/                    Lean project (mounted into the container at /work)
  lean-toolchain         pinned Lean version
  lakefile.toml          build config: Tactile library, tests, demo
  Tactile/Board.lean     data: Color, Block, Board, Level
  Tactile/Move.lean      the moves: whyIllegal / Legal, apply, step, runAll, messages
  Tactile/Examples.lean  a sample level used by the tests and the demo
  TactileTests.lean      tests (decide proofs + #guard checks)
  Demo.lean              `lake exe demo`
docker/
  lean.Dockerfile        Lean dev image
  compose.yaml           `lean` service
```

These folders are planned and don't exist yet: `packages/engine` (TypeScript simulator), `apps/web` (React app), `apps/server` (verify API) and `levels/` (level definitions).

## Troubleshooting

**`invalid JSON` in `lake-manifest.json`, or other strange file errors**
Your disk is probably full. Check with `df -h`. If `lean/lake-manifest.json` is empty (0 bytes), delete it, free some space, and build again.

**`permission denied` writing to `lean/.lake` (Linux)**
The container runs as user id `1000`. If your Linux user has a different id (check with `id -u`), the container can't write to the mounted folder. Ask the team. The fix is to build the image with your user id. Docker Desktop on macOS and Windows handles this automatically.

**No live proof view in VS Code**
We run Lean only in Docker, so the VS Code Lean 4 extension (which needs Lean installed locally) isn't set up. Errors show up when you run `lake build`.
