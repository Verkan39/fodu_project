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
  runScript "swap, paint, rotate" [.swap 0 2, .paint 2 .cyan, .rotate 2]
  runScript "pointless moves are legal" [.swap 3 3, .paint 1 .cyan]
  runScript "four rotations come back to the start" [.rotate 0, .rotate 0, .rotate 0, .rotate 0]
  runScript "locked cell stops the run" [.swap 0 2, .rotate 4, .paint 2 .cyan]
  runScript "cell that doesn't exist" [.swap 0 12]
  runScript "two cells that don't exist" [.swap 10 12]
  runScript "colour not in the palette" [.paint 2 .violet]
