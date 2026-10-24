import Tactile.Move

/-!
# The trace: what the board looks like after each move

The proof check (`Proof.lean`) only says *whether* a proof works. The game also needs to *show*
it: the board after every line, which cells turn red, and the message. This file computes that
with the same `Move.step` the proof uses, and prints it as JSON for the server.

Shapes match what the frontend uses, so it can animate Lean's answer directly, with no move
rules of its own.

```
{ "steps": [ { "line": 1, "move": { "kind": "swap", "a": 2, "b": 8 },
               "board": [ { "id": 0, "color": "yellow", "turns": 1 }, … ] }, … ],
  "stop":  null | { "line": 2, "why": { "kind": "locked", "cells": [5] }, "cells": [2,5],
                   "message": "Cell 5 is locked …" },
  "differing": [3, 9] }
```

* `steps`: one entry per **move**, tagged with the proof line it came from. A helper call
  gives several steps with the same line.
  * `move`: the plain move, so the screen can say what happened and ring the cells it touched.
  * `board`: the board after the move. Each block also carries two numbers that aren't game
    rules but let the screen animate: `id` follows a block as swaps move it (the start board
    numbers its blocks 0, 1, 2, … in reading order), and `turns` counts quarter turns and only
    goes up, so ← back to ↑ keeps turning clockwise. The facing the rules use is `turns % 4`.
* `stop`: the first illegal move, or `null`. The run stops there (decision A2).
  * `why`: the rule that failed. `noSuchCell` and `locked` carry the offending cells,
    `colorNotAllowed` carries the colour.
  * `cells`: the cells the move names that exist. These turn red (decision B3). A cell that
    doesn't exist is only in `why.cells`; the UI shows it as a red grid border.
* `differing`: the cells (1-based) of the last board that differ from the target (decision C1).
-/

namespace Tactile.Trace

/-- Escapes a string for JSON. Our messages hold no quotes, but nothing should rely on that. -/
def escape (s : String) : String :=
  s.foldl (fun acc c => acc ++ match c with
    | '"'  => "\\\""
    | '\\' => "\\\\"
    | '\n' => "\\n"
    | c    => c.toString) ""

def str (s : String) : String := "\"" ++ escape s ++ "\""
def arr (xs : List String) : String := "[" ++ ",".intercalate xs ++ "]"
def nats (ns : List Nat) : String := arr (ns.map toString)

def board (b : Board) : String :=
  arr (b.map fun k => arr [str k.color.name, toString k.facing.val])

/-- A JSON object from `(key, already-encoded value)` pairs. -/
def obj (fields : List (String × String)) : String :=
  "{" ++ ",".intercalate (fields.map fun (k, v) => str k ++ ":" ++ v) ++ "}"

/-- The rule that failed, in the frontend's shape. -/
def why : Illegal → String
  | .noSuchCell cs      => obj [("kind", str "noSuchCell"), ("cells", nats cs)]
  | .locked cs          => obj [("kind", str "locked"), ("cells", nats cs)]
  | .colorNotAllowed c  => obj [("kind", str "colorNotAllowed"), ("color", str c.name)]

/-- The cells (1-based) whose block differs between two boards of the same size. -/
def differing (b t : Board) : List Nat :=
  ((List.range b.length).zip (b.zip t)).filterMap fun (i, x, y) => if x != y then some (i + 1) else none

/-- A level in the same shape as the frontend's levels JSON. The server's tests use it to check
that the JSON and `Levels.lean` describe the same levels. -/
def levelJson (L : Level) (s t : Board) : String :=
  obj [("width", toString L.width), ("locked", nats L.locked),
       ("palette", arr (L.palette.map fun c => str c.name)),
       ("lineLimit", match L.lineLimit with | none => "null" | some n => toString n),
       ("start", board s), ("target", board t)]

/-- A move in the frontend's shape. -/
def moveJson : Move → String
  | .swap a b  => obj [("kind", str "swap"), ("a", toString a), ("b", toString b)]
  | .paint i c => obj [("kind", str "paint"), ("cell", toString i), ("color", str c.name)]
  | .rotate i  => obj [("kind", str "rotate"), ("cell", toString i)]

/-! ## Animation tags

What the screen needs besides a block's look: which block it is (`id`), and how many quarter turns
it has made (`turns`). They are not game rules, so `Board` doesn't carry them; the trace follows
them next to the board. -/

/-- `(id, turns)` for one cell. -/
abbrev Tag := Nat × Nat

/-- The start board's tags: blocks numbered 0, 1, 2, … in reading order, turns = facing. The
frontend numbers the start board the same way (`apps/web/src/engine/levels.ts`). -/
def startTags (b : Board) : List Tag :=
  (List.range b.length).zip (b.map fun k => k.facing.val)

/-- How a legal move changes the tags. It mirrors `Move.apply`: a swap moves the two tags with their
blocks, a rotate adds a turn, a paint changes neither. `tagsAgree` checks the two stay in step. -/
def track : Move → List Tag → List Tag
  | .swap x y, ts =>
    mapWithIndex (fun i t =>
      if i = Move.position x then ts.getD (Move.position y) t
      else if i = Move.position y then ts.getD (Move.position x) t
      else t) ts
  | .paint _ _, ts => ts
  | .rotate c, ts => mapWithIndex (fun i t => if i = Move.position c then (t.1, t.2 + 1) else t) ts

/-- A board with its tags: `[{ "id", "color", "turns" }, …]`. -/
def animated (b : Board) (ts : List Tag) : String :=
  arr ((b.zip ts).map fun (k, t) =>
    obj [("id", toString t.1), ("color", str k.color.name), ("turns", toString t.2)])

/-- After every legal move, each tag's turns give the block's facing (`turns % 4`), and the ids are
still 0, 1, 2, … in some order. So `track` agrees with `Move.apply`. -/
def tagsAgree (L : Level) (start : Board) (ms : List Move) : Bool :=
  go start (startTags start) ms
where
  go (b : Board) (ts : List Tag) : List Move → Bool
    | [] => true
    | m :: rest =>
      match Move.step L b m with
      | .error _ => true
      | .ok next =>
        let ts' := track m ts
        let ids := ts'.map (·.1)
        ((next.zip ts').all fun (k, t) => t.2 % 4 == k.facing.val) &&
          ids.length == next.length && (List.range next.length).all ids.contains &&
          go next ts' rest

/-- Runs the moves (each tagged with its proof line) from `start` and prints the trace. -/
def run (L : Level) (start target : Board) (ms : List (Nat × Move)) : String :=
  go start (startTags start) [] ms
where
  go (b : Board) (ts : List Tag) (steps : List String) : List (Nat × Move) → String
    | [] => done b steps "null"
    | (line, m) :: rest =>
      match Move.step L b m with
      | .ok next =>
        let ts' := track m ts
        go next ts' (obj [("line", toString line), ("move", moveJson m), ("board", animated next ts')] :: steps) rest
      | .error e =>
        done b steps (obj [
          ("line", toString line),
          ("why", why e),
          ("cells", nats (m.cells.eraseDups.filter fun c => 1 ≤ c && c ≤ b.length)),
          ("message", str (e.message L b))])
  done (b : Board) (steps : List String) (stop : String) : String :=
    obj [("steps", arr steps.reverse), ("stop", stop), ("differing", nats (differing b target))]

end Tactile.Trace
