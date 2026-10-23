/-!
# The board

The data the three moves work on: colours, blocks, the board and a level's rules.
-/

namespace Tactile

/-- The colours a block can have. Red is deliberately missing, because red means
"illegal move". These names are placeholders until the UI palette is decided. -/
inductive Color where
  | amber | cyan | violet | jade | ivory
  deriving DecidableEq, Repr

/-- A block has a colour and a facing: 0 = up, 1 = right, 2 = down, 3 = left.
`Fin 4` means "a number below 4", and its arithmetic wraps around: `3 + 1 = 0`.
That wrap-around is exactly what `rotate` needs. -/
structure Block where
  color  : Color
  facing : Fin 4
  deriving DecidableEq, Repr

/-- The board is a flat list of blocks, one per cell, in reading order.
On a 3×3 board, cell 0 is top-left, cell 4 is the centre and cell 8 is bottom-right. -/
abbrev Board := List Block

/-- The fixed rules of one level. -/
structure Level where
  /-- Cells per row. Only used for drawing; no move needs rows or columns. -/
  width   : Nat
  /-- Cells that no move may touch. -/
  locked  : List Nat
  /-- The colours `paint` may use in this level. -/
  palette : List Color
  deriving Repr

/-! ## Drawing a board as text (for the demo and for debugging) -/

def Color.name : Color → String
  | .amber => "amber" | .cyan => "cyan" | .violet => "violet"
  | .jade => "jade" | .ivory => "ivory"

def Color.letter : Color → String
  | .amber => "A" | .cyan => "C" | .violet => "V" | .jade => "J" | .ivory => "I"

def Block.arrow (blk : Block) : String :=
  match blk.facing.val with
  | 0 => "↑" | 1 => "→" | 2 => "↓" | _ => "←"

/-- A block as two characters, e.g. `A↑` for an amber block facing up. -/
def Block.render (blk : Block) : String :=
  blk.color.letter ++ blk.arrow

/-- The board as rows of text. Locked cells are wrapped in brackets, e.g. `[I↓]`. -/
def Board.render (L : Level) (b : Board) : String :=
  let cell (i : Nat) (blk : Block) : String :=
    if L.locked.contains i then s!"[{blk.render}]" else s!" {blk.render} "
  let cells := (List.range b.length).zip b |>.map fun (i, blk) => cell i blk
  let rowCount := (b.length + L.width - 1) / L.width
  let rows := (List.range rowCount).map fun r => (cells.drop (r * L.width)).take L.width
  "\n".intercalate (rows.map String.join)

end Tactile
