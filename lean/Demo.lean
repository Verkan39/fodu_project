import Tactile

/-!
# Demo

Runs a few scripts on the sample level and prints the board after each move, or the
error message and where the run stopped.
Run it with `lake exe demo`.
-/

open Tactile Tactile.Examples

def showMove : Move → String
  | .swap a b   => s!"swap {a} {b}"
  | .paint i c  => s!"paint {i} {c.name}"
  | .rotate i   => s!"rotate {i}"

/-- Run a script one move at a time, printing each board, and stop at the first illegal move. -/
def runScript (title : String) (moves : List Move) : IO Unit := do
  IO.println s!"── {title} ──"
  IO.println (Board.render level start)
  let mut board := start
  for m in moves do
    match Move.step level board m with
    | .ok next =>
      IO.println s!"\n> {showMove m}"
      IO.println (Board.render level next)
      board := next
    | .error why =>
      IO.println s!"\n> {showMove m}   ✗ illegal, red cells: {m.cells}"
      IO.println s!"  {why.message level board}"
      IO.println "  (run stopped here)"
      break
  IO.println ""

def main : IO Unit := do
  runScript "swap, paint, rotate" [.swap 1 3, .paint 3 .blue, .rotate 3]
  runScript "pointless moves are legal" [.swap 4 4, .paint 2 .blue]
  runScript "four rotations come back to the start" [.rotate 1, .rotate 1, .rotate 1, .rotate 1]
  runScript "locked cell stops the run" [.swap 1 3, .rotate 5, .paint 3 .blue]
  runScript "cell that doesn't exist" [.swap 1 13]
  runScript "cell 0 doesn't exist (numbering starts at 1)" [.swap 0 3]
  runScript "two cells that don't exist" [.swap 11 13]
  runScript "colour not in the palette" [.paint 3 .pink]
