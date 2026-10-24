/-!
# The board

The data the three moves work on: colours, blocks, the board and a level's rules.
-/

namespace Tactile

/-- The colours a block can have. Red is deliberately missing, because red means
"illegal move". These names are placeholders until the UI palette is decided. -/
inductive Color where
  | yellow | blue | pink | green | white
  deriving DecidableEq, Repr

/-- A block has a colour and a facing: 0 = up, 1 = right, 2 = down, 3 = left.
`Fin 4` means "a number below 4", and its arithmetic wraps around: `3 + 1 = 0`.
That wrap-around is exactly what `rotate` needs. -/
structure Block where
  color  : Color
  facing : Fin 4
  deriving DecidableEq, Repr

/-- The board is a flat list of blocks, one per cell, in reading order.

**Cell numbers are 1-based for players.** On a 3×3 board, cell 1 is top-left, cell 5 is the
centre and cell 9 is bottom-right. The list itself is indexed from 0 as usual, and a move's
`apply` converts (see `Move.apply`). -/
abbrev Board := List Block

/-- The fixed rules of one level. -/
structure Level where
  /-- Cells per row. Only used for drawing; no move needs rows or columns. -/
  width   : Nat
  /-- Cells that no move may touch. **1-based**, like everything a player sees. -/
  locked  : List Nat
  /-- The colours `paint` may use in this level. -/
  palette : List Color
  /-- The most lines a solution may have, or `none` for no limit. A helper costs its number
  of moves and each call costs 1 (Learning Log, Entry 6). -/
  lineLimit : Option Nat := none
  deriving Repr

/-! ## Drawing a board as text (for the demo and for debugging) -/

def Color.name : Color → String
  | .yellow => "yellow" | .blue => "blue" | .pink => "pink"
  | .green => "green" | .white => "white"

/-- One letter per colour, used in the text drawing. Every colour starts with a different
letter, so the drawing stays readable. -/
def Color.letter : Color → String
  | .yellow => "Y" | .blue => "B" | .pink => "P" | .green => "G" | .white => "W"

/-- Every colour. `TactileTests` checks that none is missing from this list. -/
def Color.all : List Color := [.yellow, .blue, .pink, .green, .white]

def Block.arrow (blk : Block) : String :=
  match blk.facing.val with
  | 0 => "↑" | 1 => "→" | 2 => "↓" | _ => "←"

/-- A block as two characters, e.g. `Y↑` for a yellow block facing up. -/
def Block.render (blk : Block) : String :=
  blk.color.letter ++ blk.arrow

/-- A one-line key for the text drawing: each letter with its colour name. -/
def Board.legend : String :=
  "  ".intercalate (Color.all.map fun c => s!"{c.letter} {c.name}")
    ++ "    arrows = facing    [ ] = locked"

/-- The board as rows of text. Locked cells are wrapped in brackets, e.g. `[W↓]`.
`i` is the list position (0-based), so the player's cell number is `i + 1`. -/
def Board.render (L : Level) (b : Board) : String :=
  let cell (i : Nat) (blk : Block) : String :=
    if L.locked.contains (i + 1) then s!"[{blk.render}]" else s!" {blk.render} "
  let cells := (List.range b.length).zip b |>.map fun (i, blk) => cell i blk
  let rowCount := (b.length + L.width - 1) / L.width
  let rows := (List.range rowCount).map fun r => (cells.drop (r * L.width)).take L.width
  "\n".intercalate (rows.map String.join)

end Tactile
