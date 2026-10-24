import Tactile

/-!
# Tests for the three moves

Each `example` is a statement Lean must prove. `decide` proves it by computing both sides,
so if a move behaves differently from what is written here, `lake build` fails.

Cell numbers are **1-based**, as players see them. The sample board (`[ ]` = locked):

```
 Y↑  B↑  P→      cells 1 2 3
 G↑ [W↓] Y←      cells 4 5 6
 B→  P↑  G↑      cells 7 8 9
```
Palette: yellow, blue, green. Pink and white are not allowed.
-/

namespace TactileTests

open Tactile Tactile.Examples

/-- The error of an `Except`, or `none` if it succeeded. Lets us test errors with `decide`. -/
def errorOf {ε α : Type} : Except ε α → Option ε
  | .error e => some e
  | .ok _    => none

/-! ## swap -/

-- The two blocks change places and keep their own colour and facing.
example : (Move.swap 1 3).apply start =
    [ ⟨.pink, 1⟩, ⟨.blue, 0⟩,  ⟨.yellow, 0⟩,
      ⟨.green, 0⟩,   ⟨.white, 2⟩, ⟨.yellow, 3⟩,
      ⟨.blue, 1⟩,   ⟨.pink, 0⟩, ⟨.green, 0⟩ ] := by decide

-- Swapping in either order gives the same board.
example : (Move.swap 1 3).apply start = (Move.swap 3 1).apply start := by decide

-- A pointless swap is legal and changes nothing.
example : (Move.swap 4 4).Legal level start := by decide
example : (Move.swap 4 4).apply start = start := by decide

-- The first and last cells are both valid.
example : (Move.swap 1 9).Legal level start := by decide
example : (Move.swap 1 9).apply start =
    [ ⟨.green, 0⟩,   ⟨.blue, 0⟩,  ⟨.pink, 1⟩,
      ⟨.green, 0⟩,   ⟨.white, 2⟩, ⟨.yellow, 3⟩,
      ⟨.blue, 1⟩,   ⟨.pink, 0⟩, ⟨.yellow, 0⟩ ] := by decide

-- Cell 5 is locked.
example : (Move.swap 1 5).whyIllegal level start = some (.locked [5]) := by decide
example : (Move.swap 5 5).whyIllegal level start = some (.locked [5]) := by decide

-- Cell 13 doesn't exist.
example : (Move.swap 1 13).whyIllegal level start = some (.noSuchCell [13]) := by decide
example : ¬ (Move.swap 1 13).Legal level start := by decide

-- Cell 10 is one past the end, and cell 0 is below the start. Neither exists.
example : (Move.swap 1 10).whyIllegal level start = some (.noSuchCell [10]) := by decide
example : (Move.swap 0 3).whyIllegal level start = some (.noSuchCell [0]) := by decide
example : (Move.swap 0 0).whyIllegal level start = some (.noSuchCell [0]) := by decide

-- Only the first failing rule is reported (decision A1): "doesn't exist" beats "locked".
example : (Move.swap 13 5).whyIllegal level start = some (.noSuchCell [13]) := by decide

/-! ## paint -/

-- Only the colour changes. The block keeps facing right.
example : (Move.paint 3 .blue).apply start =
    [ ⟨.yellow, 0⟩, ⟨.blue, 0⟩,  ⟨.blue, 1⟩,
      ⟨.green, 0⟩,  ⟨.white, 2⟩, ⟨.yellow, 3⟩,
      ⟨.blue, 1⟩,  ⟨.pink, 0⟩, ⟨.green, 0⟩ ] := by decide

-- Painting a block the colour it already has is legal and changes nothing.
example : (Move.paint 2 .blue).Legal level start := by decide
example : (Move.paint 2 .blue).apply start = start := by decide

-- Pink isn't in this level's palette.
example : (Move.paint 3 .pink).whyIllegal level start = some (.colorNotAllowed .pink) := by
  decide

example : (Move.paint 5 .blue).whyIllegal level start = some (.locked [5]) := by decide
example : (Move.paint 10 .blue).whyIllegal level start = some (.noSuchCell [10]) := by decide
example : (Move.paint 0 .blue).whyIllegal level start = some (.noSuchCell [0]) := by decide

/-! ## rotate -/

-- A quarter turn clockwise: right becomes down. The colour stays.
example : (Move.rotate 3).apply start =
    [ ⟨.yellow, 0⟩, ⟨.blue, 0⟩,  ⟨.pink, 2⟩,
      ⟨.green, 0⟩,  ⟨.white, 2⟩, ⟨.yellow, 3⟩,
      ⟨.blue, 1⟩,  ⟨.pink, 0⟩, ⟨.green, 0⟩ ] := by decide

-- Facing wraps around: cell 6 faces left (3), and one more turn brings it to up (0).
-- (`getD 5` reads the 6th list position, because the list itself is 0-based.)
example : ((Move.rotate 6).apply start).getD 5 ⟨.yellow, 1⟩ = ⟨.yellow, 0⟩ := by decide

-- Four quarter turns bring a block back to where it started.
example : [Move.rotate 1, .rotate 1, .rotate 1, .rotate 1].foldl (fun b m => m.apply b) start
    = start := by decide

example : (Move.rotate 5).whyIllegal level start = some (.locked [5]) := by decide
example : (Move.rotate 10).whyIllegal level start = some (.noSuchCell [10]) := by decide
example : (Move.rotate 0).whyIllegal level start = some (.noSuchCell [0]) := by decide

/-! ## step and runAll -/

-- `step` on a legal move gives the same board as `apply`.
example : (Move.step level start (.swap 1 3)).toOption = some ((Move.swap 1 3).apply start) := by
  decide

-- `step` on an illegal move gives the reason and no board.
example : errorOf (Move.step level start (.rotate 5)) = some (.locked [5]) := by decide

-- `runAll` stops at the first illegal move (decision A2): move 1 fails, and move 2 never runs.
-- The index is 0-based (the first move is 0); it is a position in the list, not a player number.
example : errorOf (Move.runAll level start [.swap 1 3, .rotate 5, .paint 3 .blue])
    = some (1, .locked [5]) := by decide

-- When every move is legal, `runAll` applies them in order.
example : (Move.runAll level start [.swap 1 3, .rotate 1]).toOption =
    some ((Move.rotate 1).apply ((Move.swap 1 3).apply start)) := by decide

/-! ## Proofs (the proof layer)

These must compile: a proof written with the move tactics, line by line. The failing cases
(illegal move, wrong board, typos) are checked by the fixtures in `lean/fixtures/`, because
they need line numbers. -/

example : Reach level start target := by
  swap 1 3
  paint 3 blue
  rotate 3
  finish

-- No moves needed when the board is already the target.
example : Reach level start start := by
  finish

-- Pointless moves are legal, so they can appear in a proof.
example : Reach level start start := by
  swap 4 4
  paint 2 blue
  finish

-- Four quarter turns bring the block back.
example : Reach level start start := by
  rotate 1
  rotate 1
  rotate 1
  rotate 1
  finish

/-! ## Colours -/

-- If a colour is added to `Color` but forgotten in `Color.all` (the list behind the legend),
-- this stops compiling: `cases` makes Lean check every colour one by one.
example : ∀ c : Color, c ∈ Color.all := by
  intro c
  cases c <;> decide

-- Each colour has its own letter, so the text drawing is unambiguous.
#guard (Color.all.map Color.letter).eraseDups.length == Color.all.length

#guard Board.legend ==
  "Y yellow  B blue  P pink  G green  W white    arrows = facing    [ ] = locked"

/-! ## Messages (decision D)

`#guard` runs the check as a normal program instead of proving it with `decide`.
It's the better tool for text, and the build still fails if the check is false. -/

#guard (Illegal.noSuchCell [13]).message level start ==
  "Cell 13 doesn't exist. This board has cells 1–9."
#guard (Illegal.noSuchCell [0]).message level start ==
  "Cell 0 doesn't exist. This board has cells 1–9."
#guard (Illegal.noSuchCell [11, 13]).message level start ==
  "Cells 11 and 13 don't exist. This board has cells 1–9."
#guard (Illegal.locked [5]).message level start ==
  "Cell 5 is locked and can't be moved, painted or rotated."
#guard (Illegal.colorNotAllowed .pink).message level start ==
  "Pink isn't available here. You can use yellow, blue or green."

end TactileTests
