import Tactile.Move

/-!
# The proof layer

This is what makes the game a *proof* puzzle. A player's script is the body of a Lean
proof of `Reach level start target`, and each line is one move:

```lean
theorem sol : Reach level start target := by
  swap 1 3
  paint 3 blue
  rotate 3
  finish          -- added by the server, not typed by the player
```

`Reach L b t` says "board `b` can be turned into board `t` using legal moves".
It has two ways to be proved:

* `done`: the boards are already equal.
* `step`: make one **legal** move, then prove the rest from the new board.

Because `step` demands a proof that the move is legal, **a finished proof is, by
construction, a list of legal moves**. There is no way to write a proof that skips a rule,
apart from cheating with `sorry` or extra axioms, which the server must check for.

## How failures are told apart

Lean carries on checking after the first error (tested in the spike, Learning Log
Entry 5), so we mark our own failures with a message that starts with a fixed word:

* `tactile:illegal`: a move broke a rule (cell missing, cell locked, colour not allowed).
* `tactile:mismatch`: every move was legal but the board is not the target.

Any other error on a player's line is a typo or bad syntax ("invalid command").
The server (`apps/server/src/verdict.ts`) relies on these exact words.
-/

namespace Tactile

/-- `Reach L b t`: board `b` can reach board `t` by legal moves. -/
inductive Reach (L : Level) : Board → Board → Prop where
  /-- Nothing left to do: the boards are equal. -/
  | done {b t : Board} : b = t → Reach L b t
  /-- Make one legal move `m`, then continue from the new board. -/
  | step {b t : Board} (m : Move) (h : m.Legal L b) :
      Reach L (m.apply b) t → Reach L b t

/-! ## The move tactics

Cell numbers must be plain number literals (`num`), so `swap (1+1) 3` is a syntax error.
Colours are bare words (`blue`), turned into `Tactile.Color.blue`; a word that isn't a
colour is an error on that line.

Each tactic expands to one `Reach.step`. The legality proof is `decide`, and when it
fails we replace Lean's message with our marker. -/

syntax "swap " num num : tactic
syntax "paint " num ident : tactic
syntax "rotate " num : tactic
/-- Closes the proof when the board equals the target. The server adds it after the player's
last line. -/
syntax "finish" : tactic

macro_rules
  | `(tactic| swap $a $b) =>
    `(tactic| refine Tactile.Reach.step (Tactile.Move.swap $a $b)
        (by first | decide | fail "tactile:illegal") ?_)
  | `(tactic| paint $i $c) =>
    let color := Lean.mkIdentFrom c (`Tactile.Color ++ c.getId)
    `(tactic| refine Tactile.Reach.step (Tactile.Move.paint $i $color)
        (by first | decide | fail "tactile:illegal") ?_)
  | `(tactic| rotate $i) =>
    `(tactic| refine Tactile.Reach.step (Tactile.Move.rotate $i)
        (by first | decide | fail "tactile:illegal") ?_)
  | `(tactic| finish) =>
    `(tactic| exact Tactile.Reach.done (by first | decide | fail "tactile:mismatch"))

end Tactile
