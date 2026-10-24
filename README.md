# Tactile *(working title)*

A puzzle game where **writing a correct proof is the same thing as solving the puzzle**.

Built for **Syntax Error 2026** (Oct 23–25), Functional Programming track, Problem Statement 2: *Proof Puzzle*.

## What we're building

You get a grid of coloured blocks and a target picture. You solve a level by writing a short **Lean 4** proof where each line is one move:

```lean
swap 1 3        -- exchange the blocks in cells 1 and 3
paint 5 blue    -- turn the block in cell 5 blue
rotate 6        -- turn the block in cell 6 a quarter turn clockwise
```

Cells are numbered **from 1**, in reading order. On a 3×3 board, cell 1 is top-left and cell 9 is bottom-right. Cell numbers must be plain numbers: `swap (1+1) 3` is not allowed.

- **Run** plays the moves back one line at a time, so you can watch the board change.
- An **illegal move** (a cell that doesn't exist, a locked block, a colour not allowed in the level) turns that block red, and the proof fails at that line.
- A line that isn't a command at all (a typo such as `swpa 1 2`) is reported as an **invalid command**.
- The level is **cleared** when Lean accepts the proof **and** the board matches the target.
- Later levels let you name a **helper** (a reusable group of moves) and call it. Shorter proofs earn more stars, so reusing helpers pays off.

### How it works

| Part | Tech | Status |
|---|---|---|
| Game rules and proof checking | Lean 4 (core only, no Mathlib) | 🟢 The three moves are done and tested |
| Proof layer: each proof line is a move | Lean 4 tactics | 🟢 Done: a proof compiles, or fails on the right line |
| Verdict: cleared, illegal move, invalid command, wrong board | Node + TypeScript | 🟢 Done and tested against real Lean |
| Helpers and stars | Lean 4 macros | ⏸️ On hold |
| In-browser simulator | TypeScript (pure functions) | ⏸️ On hold |
| Board after each line, as JSON | Lean 4 | ⚪ Planned |
| Web app | React, Vite, CodeMirror 6 | ⚪ Planned |
| Verify API with a sandboxed Lean runner | Node + TypeScript | ⚪ Planned |
| Packaging | Docker | 🟢 Lean dev image |

**Real Lean** is the judge of whether a proof is correct.

## Setup

Lean runs **inside Docker**, so you don't need to install Lean on your machine.

### Requirements

- **Docker** with **Compose v2** (`docker compose version` should work)
- **git**
- **Node.js**, for the verdict scripts. It needs to run `.ts` files directly; we tested on **v26.3.0** only. No packages to install.
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

It prints the board before and after each move on a sample level. `[ ]` marks a locked cell, letters are colours (Y = yellow, B = blue, P = pink, G = green, W = white), and arrows are facings:

```
── swap, paint, rotate ──
 Y↑  B↑  P→
 G↑ [W↓] Y←
 B→  P↑  G↑

> swap 1 3
 P→  B↑  Y↑
 ...
```

### 5. Check proofs with real Lean (Node)

```bash
cd apps/server
npm test              # 20 quick unit tests, no Docker needed
npm run fixtures      # runs 29 example proofs through real Lean (about 10 seconds)
```

To try your own proof and see the verdict:

```bash
npm run check -- "swap 1 3" "paint 3 blue" "rotate 3"   # each argument is one line
npm run check -- "swap 1 3\nrotate 5"                   # or use \n inside one argument
npm run check -- --help                                 # the sample board, and all options
```

Each run starts by drawing the **start board**, the **target board** and the **cell numbers** side by side, so you can see what you are aiming for. Add `--messages` to see what Lean said, `--source` to see the Lean file we generated, and `--target start` to aim for the starting board. If `--target` isn't a valid board, the tool stops with an error (exit code 2) instead of printing a verdict.

Each file in `lean/fixtures/` is a player's proof plus the verdict we expect (`# expect: illegal 2`). The second command starts Lean in Docker for each one and checks that the verdict is right. It ends with:

```
29/29 fixtures gave the expected verdict
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
  Tactile/Proof.lean     the proof layer: Reach, and the tactics swap / paint / rotate / finish
  Tactile/Examples.lean  a sample level used by the tests and the demo
  TactileTests.lean      tests (decide proofs + #guard checks)
  Demo.lean              `lake exe demo`
  fixtures/              example player proofs, each with the verdict we expect
apps/server/             Node + TypeScript, no dependencies
  src/template.ts        wraps a player's lines into the Lean file that checks them
  src/lean.ts            runs Lean in Docker and reads its JSON messages
  src/verdict.ts         turns Lean's messages into one verdict
  test/                  unit tests
  scripts/run-fixtures.ts  checks every fixture against real Lean
docker/
  lean.Dockerfile        Lean dev image
  compose.yaml           `lean` service
```

These are planned and don't exist yet: `apps/web` (React app) and `levels/` (level definitions). The in-browser simulator is on hold.

## Troubleshooting

**`invalid JSON` in `lake-manifest.json`, or other strange file errors**
Your disk is probably full. Check with `df -h`. If `lean/lake-manifest.json` is empty (0 bytes), delete it, free some space, and build again.

**`permission denied` writing to `lean/.lake` (Linux)**
The container runs as user id `1000`. If your Linux user has a different id (check with `id -u`), the container can't write to the mounted folder. Ask the team. The fix is to build the image with your user id. Docker Desktop on macOS and Windows handles this automatically.

**No live proof view in VS Code**
We run Lean only in Docker, so the VS Code Lean 4 extension (which needs Lean installed locally) isn't set up. Errors show up when you run `lake build`.
