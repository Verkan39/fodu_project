import Tactile

/-!
# Tests for the three moves

Each `example` is a statement Lean must prove. `decide` proves it by computing both sides,
so if a move behaves differently from what is written here, `lake build` fails.

The sample board (`[ ]` = locked):

```
 A↑  C↑  V→      cells 0 1 2
 J↑ [I↓] A←      cells 3 4 5
 C→  V↑  J↑      cells 6 7 8
```
Palette: amber, cyan, jade. Violet and ivory are not allowed.
-/

namespace TactileTests

open Tactile Tactile.Examples

/-- The error of an `Except`, or `none` if it succeeded. Lets us test errors with `decide`. -/
def errorOf {ε α : Type} : Except ε α → Option ε
  | .error e => some e
  | .ok _    => none

/-! ## swap -/

-- The two blocks change places and keep their own colour and facing.
example : (Move.swap 0 2).apply start =
    [ ⟨.violet, 1⟩, ⟨.cyan, 0⟩,  ⟨.amber, 0⟩,
      ⟨.jade, 0⟩,   ⟨.ivory, 2⟩, ⟨.amber, 3⟩,
      ⟨.cyan, 1⟩,   ⟨.violet, 0⟩, ⟨.jade, 0⟩ ] := by decide

-- Swapping in either order gives the same board.
example : (Move.swap 0 2).apply start = (Move.swap 2 0).apply start := by decide

-- A pointless swap is legal and changes nothing.
example : (Move.swap 3 3).Legal level start := by decide
example : (Move.swap 3 3).apply start = start := by decide

example : (Move.swap 0 8).Legal level start := by decide

-- Cell 4 is locked.
example : (Move.swap 0 4).whyIllegal level start = some (.locked [4]) := by decide
example : (Move.swap 4 4).whyIllegal level start = some (.locked [4]) := by decide

-- Cell 12 doesn't exist.
example : (Move.swap 0 12).whyIllegal level start = some (.noSuchCell [12]) := by decide
example : ¬ (Move.swap 0 12).Legal level start := by decide

-- Only the first failing rule is reported (decision A1): "doesn't exist" beats "locked".
example : (Move.swap 12 4).whyIllegal level start = some (.noSuchCell [12]) := by decide

/-! ## paint -/

-- Only the colour changes. The block keeps facing right.
example : (Move.paint 2 .cyan).apply start =
    [ ⟨.amber, 0⟩, ⟨.cyan, 0⟩,  ⟨.cyan, 1⟩,
      ⟨.jade, 0⟩,  ⟨.ivory, 2⟩, ⟨.amber, 3⟩,
      ⟨.cyan, 1⟩,  ⟨.violet, 0⟩, ⟨.jade, 0⟩ ] := by decide

-- Painting a block the colour it already has is legal and changes nothing.
example : (Move.paint 1 .cyan).Legal level start := by decide
example : (Move.paint 1 .cyan).apply start = start := by decide

-- Violet isn't in this level's palette.
example : (Move.paint 2 .violet).whyIllegal level start = some (.colorNotAllowed .violet) := by
  decide

example : (Move.paint 4 .cyan).whyIllegal level start = some (.locked [4]) := by decide
example : (Move.paint 9 .cyan).whyIllegal level start = some (.noSuchCell [9]) := by decide

/-! ## rotate -/

-- A quarter turn clockwise: right becomes down. The colour stays.
example : (Move.rotate 2).apply start =
    [ ⟨.amber, 0⟩, ⟨.cyan, 0⟩,  ⟨.violet, 2⟩,
      ⟨.jade, 0⟩,  ⟨.ivory, 2⟩, ⟨.amber, 3⟩,
      ⟨.cyan, 1⟩,  ⟨.violet, 0⟩, ⟨.jade, 0⟩ ] := by decide

-- Facing wraps around: cell 5 faces left (3), and one more turn brings it to up (0).
example : ((Move.rotate 5).apply start).getD 5 ⟨.amber, 0⟩ = ⟨.amber, 0⟩ := by decide

-- Four quarter turns bring a block back to where it started.
example : [Move.rotate 0, .rotate 0, .rotate 0, .rotate 0].foldl (fun b m => m.apply b) start
    = start := by decide

example : (Move.rotate 4).whyIllegal level start = some (.locked [4]) := by decide
example : (Move.rotate 9).whyIllegal level start = some (.noSuchCell [9]) := by decide

/-! ## step and runAll -/

-- `step` on a legal move gives the same board as `apply`.
example : (Move.step level start (.swap 0 2)).toOption = some ((Move.swap 0 2).apply start) := by
  decide

-- `step` on an illegal move gives the reason and no board.
example : errorOf (Move.step level start (.rotate 4)) = some (.locked [4]) := by decide

-- `runAll` stops at the first illegal move (decision A2): move 1 fails, and move 2 never runs.
example : errorOf (Move.runAll level start [.swap 0 2, .rotate 4, .paint 2 .cyan])
    = some (1, .locked [4]) := by decide

-- When every move is legal, `runAll` applies them in order.
example : (Move.runAll level start [.swap 0 2, .rotate 0]).toOption =
    some ((Move.rotate 0).apply ((Move.swap 0 2).apply start)) := by decide

/-! ## Messages (decision D)

`#guard` runs the check as a normal program instead of proving it with `decide`.
It's the better tool for text, and the build still fails if the check is false. -/

#guard (Illegal.noSuchCell [12]).message level start ==
  "Cell 12 doesn't exist. This board has cells 0–8."
#guard (Illegal.noSuchCell [10, 12]).message level start ==
  "Cells 10 and 12 don't exist. This board has cells 0–8."
#guard (Illegal.locked [4]).message level start ==
  "Cell 4 is locked and can't be moved, painted or rotated."
#guard (Illegal.colorNotAllowed .violet).message level start ==
  "Violet isn't available here. You can use amber, cyan or jade."

end TactileTests
