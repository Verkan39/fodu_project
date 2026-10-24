# Tactile 

A puzzle game where **writing a correct proof is the same thing as solving the puzzle**.

Built for **Syntax Error 2026** (Oct 23–25), Functional Programming track, Problem Statement 2: *Proof Puzzle*.

## How to play

You get a grid of coloured blocks and a target picture. You solve a level by writing a short **Lean 4** proof where each line is one move:

```lean
swap 1 3        -- exchange the blocks in cells 1 and 3
paint 5 blue    -- turn the block in cell 5 blue
rotate 6        -- turn the block in cell 6 a quarter turn clockwise
```

Cells are numbered **from 1**, in reading order. On a 3×3 board, cell 1 is top-left and cell 9 is bottom-right. Cell numbers must be plain numbers: `swap (1+1) 3` is not allowed.

- **Run** sends your proof to real Lean. When Lean answers, the board plays your moves back one line at a time.
- An **illegal move** (a cell that doesn't exist, a locked block, a colour the level doesn't allow) turns that block red, and the proof stops at that line.
- A line that isn't a command at all (a typo such as `swpa 1 2`) is an **invalid command**. No block moves.
- The level is **cleared** when Lean accepts the proof **and** the board matches the target, within the level's line limit.

### Helpers

From level 3 on, you can name a group of moves in the helper slot and use it like a move:

```lean
macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))
macro "fix " i:num : tactic => `(tactic| (paint $i green; rotate $i; rotate $i))
```

Then `spin3` or `fix 7` in the proof. A helper may call helpers defined above it. **Lines count against the level's limit:** each helper costs one line per step, and each proof line costs 1, so a helper only pays off when you reuse it.

## How it works

```
 browser (React)                 API (Node, apps/server)                    Lean 4 (Docker)
 ───────────────                 ───────────────────────                    ───────────────
 editor ── POST /api/verify ──▶  1. parse the text: only our moves and
                                    helpers are allowed, anything else
                                    is refused here and never reaches Lean
                                 2. print a Lean file from the parsed data ─▶ check the proof,
                                                                             and run the moves
 board plays it back  ◀── JSON ── 3. verdict + the board after each move ◀── (a fresh container
 (no game rules in TS)                                                       per proof)
```

- **Lean is the only judge.** It checks the proof, and it also runs the moves with the same rules (`lean/Tactile/Trace.lean`). The browser has no copy of the rules: it animates the boards Lean sends.
- **Safety.** The parser accepts only `swap`, `paint`, `rotate`, helper calls, blank lines and `--` comments, so Lean commands such as `#eval`, `run_tac`, `sorry` or `macro_rules` are refused before Lean runs.
  - Each proof runs in its own container with **no network, 1 GB of memory, 1 CPU, 64 processes and a 15-second time limit**.
  - The API caps request bodies at 64 KB and runs at most 2 proofs at once (8 more wait in a queue).

## Run it locally

### Requirements

- **Docker** with **Compose v2** (`docker compose version` should work), and permission to use it (see Troubleshooting).
- **Node.js 22.18 or newer.** The API runs its `.ts` files directly. We use Node 24.
- **git**, and **a few GB of free disk space.** The Lean image is about 1 GB.

### 1. Clone and build Lean (first time only)

```bash
git clone <repo-url> tactile
cd tactile
docker compose -f docker/compose.yaml build lean
docker compose -f docker/compose.yaml run --rm lean lake build
```

The first command downloads the Lean toolchain at the version pinned in `lean/lean-toolchain` (**v4.35.0**). It takes a few minutes, and the "exporting layers" step is slow but not stuck.

The second compiles the game **and** checks every test: facts Lean must prove (`example … := by decide`) and programs that must return `true` (`#guard`). It ends with `Build completed successfully`.

**Run `lake build` again after any change under `lean/`.** The API uses the compiled library, so a stale build shows up as "Unknown identifier".

### 2. Start the game

Two terminals:

```bash
cd apps/server && npm start          # the API on http://127.0.0.1:3001
```

```bash
cd apps/web && npm install && npm run dev    # the game on http://localhost:5173
```

Vite forwards `/api` to the API, so the page needs no server address. To point it somewhere else, start Vite with `API_URL=http://host:port`.

### 3. Tests

```bash
cd apps/server
npm test               # parser, file builder, verdict, trace, API routes: no Docker needed
npm run fixtures       # every proof in lean/fixtures/ through real Lean, each with its expected verdict
npm run integration    # the API end to end against real Lean, incl. "levels.json matches Levels.lean"

cd ../web
npm test               # levels, state and screens, using answers recorded from real Lean
npm run build          # type-checks, then builds into dist/
```

### 4. Try a proof from the command line

```bash
cd apps/server
npm run check -- --level L1 "swap 2 8" "rotate 4" "paint 6 green"     # each argument is one line
npm run check -- --level L3 \
  --helper 'macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))' \
  "spin3" "spin3" "spin3"
npm run check -- --help
```

It draws the start board, the target and the cell numbers, then prints the verdict. `--messages` shows what Lean said, `--source` shows the Lean file we generated, and `--file proof.txt` reads the proof from a file.

### 5. Optional

```bash
docker compose -f docker/compose.yaml run --rm lean lake exe demo   # prints boards before and after moves
docker compose -f docker/compose.yaml run --rm lean bash            # a shell with Lean in it
```

## Project layout

```
lean/                       Lean project (mounted into the container at /work)
  lean-toolchain            pinned Lean version
  lakefile.toml             build config: Tactile library, tests, demo
  Tactile/Board.lean        data: Color, Block, Board, Level
  Tactile/Move.lean         the moves: whyIllegal / Legal, apply, step, runAll, messages
  Tactile/Proof.lean        the proof layer: Reach, and the tactics swap / paint / rotate / finish
  Tactile/Levels.lean       the six levels
  Tactile/Trace.lean        runs a proof's moves and prints the board after each one, as JSON
  Tactile/Examples.lean     a sample level used by the tests
  TactileTests.lean         tests for the moves
  LevelTests.lean           tests for the levels and the trace (solvable, traps, real proofs with helpers)
  Export.lean               prints the levels as JSON for the web app
  Demo.lean                 `lake exe demo`
  fixtures/                 example player proofs, each with the verdict we expect
apps/server/                Node + TypeScript, no dependencies
  src/script.ts             parses the player's text: the security boundary
  src/template.ts           prints the Lean file from the parsed text
  src/lean.ts               runs Lean in Docker (with the time limit) and reads its JSON messages
  src/verdict.ts            turns Lean's messages into one verdict
  src/trace.ts              expands helpers into moves, reads the board trace
  src/verify.ts             parse → Lean → verdict + trace → line limit
  src/outcome.ts            the answer in the frontend's shape
  src/server.ts             the HTTP API
  scripts/                  serve.ts (`npm start`), check.ts, run-fixtures.ts
  test/, integration/       unit tests; end-to-end tests against real Lean
apps/web/                   React + Vite + CodeMirror: the game in the browser
  src/engine/lean.ts        asks the API and turns Lean's answer into what the screen plays back
  src/engine/               levels, progress and shared types
  src/data/levels.json      the six levels, printed by lean/Export.lean
  src/state.ts              the reducers (play screen, app) as pure functions
  src/ui/                   title, level map, rules, play screen, board, block, editor
  test/                     level, state and screen tests, using answers recorded from real Lean
docker/
  lean.Dockerfile           the Lean image
  compose.yaml              the `lean` service, with the limits for players' proofs
deploy/
  setup.sh, deploy.sh       one-time server setup; build and restart
  Caddyfile                 HTTPS, the page, and /api forwarded to the API
  tactile-api.service       the API as a systemd service
```

## Troubleshooting

**`permission denied … docker.sock`**
Your user isn't in the `docker` group. Run `sudo usermod -aG docker $USER`, then log out and back in. Until then, `sg docker -c "npm run fixtures"` runs one command with the group. Being in the `docker` group is effectively root on that machine.

**"Unknown identifier" from Lean after changing a `.lean` file**
The compiled library is stale. Run `lake build` again (step 1).

**The game says "Proof checker offline"**
The API isn't running, or can't start Docker. Check the terminal running `npm start` (locally) or `journalctl -u tactile-api` (on the server).

**`invalid JSON` in `lake-manifest.json`, or other strange file errors**
Your disk is probably full. Check with `df -h`. If `lean/lake-manifest.json` is empty (0 bytes), delete it, free some space, and build again.

**`permission denied` writing to `lean/.lake` (Linux)**
The container runs as user id `1000`. If your Linux user has a different id (check with `id -u`), the container can't write to the mounted folder. The fix is to build the image with your user id. Docker Desktop on macOS and Windows handles this automatically.

**No live proof view in VS Code**
We run Lean only in Docker, so the VS Code Lean 4 extension (which needs Lean installed locally) isn't set up. Errors show up when you run `lake build`.
