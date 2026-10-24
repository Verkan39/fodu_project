import Tactile

/-!
# Tests for the six levels

These test the level *content* (`Tactile/Levels.lean`); `TactileTests.lean` tests the moves.
If a level is broken (unsolvable, wrong size, a locked block that differs in the target, a trap
that doesn't fire), `lake build` fails.
-/

namespace LevelTests

open Tactile Tactile.Levels

/-- The result of an `Except`, or `none` if it failed. Lets us test results with `decide`. -/
def resultOf {ε α : Type} : Except ε α → Option α
  | .ok a    => some a
  | .error _ => none

/-- A square board, a target of the same size that differs from the start, and every locked
cell exists and holds the same block in both. A locked block that differs in the target would
make the level unsolvable. -/
def wellFormed (L : Level) (s t : Board) : Bool :=
  s.length == L.width * L.width && t.length == s.length && s != t &&
    L.locked.all fun c => 1 ≤ c && c ≤ s.length && s[c - 1]? == t[c - 1]?

/-- How many blocks of colour `c` are on cells that aren't locked. If `c` isn't in the palette,
nothing can raise this number (paint can't make `c`, and swaps only move blocks around). So if
it is below the target's, the level can no longer be solved. -/
def movable (L : Level) (b : Board) (c : Color) : Nat :=
  ((List.range b.length).zip b).countP fun (i, blk) => blk.color == c && !L.locked.contains (i + 1)

/-! ## Every level is well formed and its reference solution reaches the target -/

example : wellFormed L1.level L1.start L1.target := by decide
example : wellFormed L2.level L2.start L2.target := by decide
example : wellFormed L3.level L3.start L3.target := by decide
example : wellFormed L4.level L4.start L4.target := by decide
example : wellFormed L5.level L5.start L5.target := by decide
example : wellFormed L6.level L6.start L6.target := by decide

example : resultOf (Move.runAll L1.level L1.start L1.solution) = some L1.target := by decide
example : resultOf (Move.runAll L2.level L2.start L2.solution) = some L2.target := by decide
example : resultOf (Move.runAll L3.level L3.start L3.solution) = some L3.target := by decide
example : resultOf (Move.runAll L4.level L4.start L4.solution) = some L4.target := by decide
example : resultOf (Move.runAll L5.level L5.start L5.solution) = some L5.target := by decide
example : resultOf (Move.runAll L6.level L6.start L6.solution) = some L6.target := by decide

/-! ## The traps fire -/

-- Level 2: the locked cell, and a colour that isn't in the palette.
example : (Move.swap 2 5).whyIllegal L2.level L2.start = some (.locked [5]) := by decide
example : (Move.paint 2 .pink).whyIllegal L2.level L2.start = some (.colorNotAllowed .pink) := by
  decide

-- Levels 4 and 6: the obvious source of the colour you need is a locked decoy.
example : (Move.swap 1 6).whyIllegal L4.level L4.start = some (.locked [6]) := by decide
example : (Move.swap 11 7).whyIllegal L6.level L6.start = some (.locked [7]) := by decide

-- Order traps: painting first destroys a colour the target still needs, so the level
-- becomes unsolvable even though the paint itself is legal.
example : movable L4.level ((Move.paint 12 .green).apply L4.start) .white
    < movable L4.level L4.target .white := by decide
example : movable L5.level ((Move.paint 7 .green).apply L5.start) .pink
    < movable L5.level L5.target .pink := by decide
example : movable L6.level ((Move.paint 6 .white).apply L6.start) .pink
    < movable L6.level L6.target .pink := by decide

/-! ## The intended solutions, written as real proofs

These go through the same tactics a player uses (`Tactile/Proof.lean`), including helpers
written the way a player writes them. That checks helpers, and helpers with a parameter,
really work, not just our model of them. -/

macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))
macro "fix " i:num : tactic => `(tactic| (paint $i green; rotate $i; rotate $i))
macro "back " i:num : tactic => `(tactic| (rotate $i; rotate $i; rotate $i))

theorem level1 : Reach L1.level L1.start L1.target := by
  swap 2 8
  rotate 4
  paint 6 green
  finish

theorem level2 : Reach L2.level L2.start L2.target := by
  swap 2 7
  paint 9 green
  rotate 3
  finish

theorem level3 : Reach L3.level L3.start L3.target := by
  spin3
  spin3
  spin3
  finish

theorem level4 : Reach L4.level L4.start L4.target := by
  swap 1 7
  swap 7 12
  paint 12 green
  swap 2 14
  swap 3 9
  finish

theorem level5 : Reach L5.level L5.start L5.target := by
  swap 2 7
  fix 7
  fix 1
  fix 4
  fix 13
  fix 16
  finish

theorem level6 : Reach L6.level L6.start L6.target := by
  swap 6 11
  paint 6 white
  swap 2 14
  swap 3 15
  back 1
  back 4
  back 13
  back 16
  finish

end LevelTests
