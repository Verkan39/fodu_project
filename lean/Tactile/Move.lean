import Tactile.Board

/-!
# The three moves

Every move has two pure functions (Learning Log, section 12):

* `isLegal`: is this move allowed? Written as `whyIllegal`, which returns the reason or
  `none`, and `Legal`, the same check as a statement Lean can prove with `decide`.
* `apply`: the new board after the move. It assumes the move is legal.

`step` runs the check and then `apply`, so callers can never skip the check.

**Numbering.** A move holds the cell numbers exactly as the player typed them, so they are
**1-based**. Only `apply` converts to a list position (`n - 1`), and only after the legality
check has rejected `0` and anything above the board size. This matters because subtraction on
natural numbers stops at zero (`0 - 1 = 0`), so an unchecked `0` would silently become cell 1.
-/

namespace Tactile

/-- The three commands a player can write. -/
inductive Move where
  | swap   (a b : Nat)
  | paint  (i : Nat) (c : Color)
  | rotate (i : Nat)
  deriving DecidableEq, Repr

/-- Why a move is illegal. Rules are checked in this order, and the first failure wins. -/
inductive Illegal where
  /-- These cells don't exist. The UI shows a red border around the grid. -/
  | noSuchCell (cells : List Nat)
  /-- These cells are locked. -/
  | locked (cells : List Nat)
  /-- `paint` used a colour that isn't in the level's palette. -/
  | colorNotAllowed (c : Color)
  deriving DecidableEq, Repr

/-- Build a new list by deciding what goes at each position. `f` gets the position and
the old item. This is the "map with index" pattern every move is built from. -/
def mapWithIndex {α β : Type} (f : Nat → α → β) (xs : List α) : List β :=
  go 0 xs
where
  go : Nat → List α → List β
    | _, []      => []
    | i, x :: xs => f i x :: go (i + 1) xs

namespace Move

/-- The cells a move touches, as the player numbered them (1-based). When a move is illegal,
all of these turn red (Learning Log, decision B3). -/
def cells : Move → List Nat
  | swap a b  => [a, b]
  | paint i _ => [i]
  | rotate i  => [i]

/-- `isLegal`, as a reason: `none` if the move is allowed, otherwise the first rule it breaks.
Pointless moves such as `swap 3 3` are legal (Learning Log, Entry 2). -/
def whyIllegal (L : Level) (b : Board) (m : Move) : Option Illegal :=
  let touched := m.cells.eraseDups
  -- Valid cells are 1 … b.length. Zero is rejected here, before `apply` can subtract.
  let missing := touched.filter (fun c => c == 0 || c > b.length)
  let locked  := touched.filter (L.locked.contains ·)
  if !missing.isEmpty then some (.noSuchCell missing)
  else if !locked.isEmpty then some (.locked locked)
  else match m with
    | paint _ c => if L.palette.contains c then none else some (.colorNotAllowed c)
    | _         => none

/-- `isLegal`, as a statement: "this move breaks no rule". Lean proves or refutes it with
`decide`, which is how a proof line will fail on an illegal move. -/
def Legal (L : Level) (b : Board) (m : Move) : Prop :=
  m.whyIllegal L b = none

instance (L : Level) (b : Board) (m : Move) : Decidable (m.Legal L b) :=
  inferInstanceAs (Decidable (_ = none))

/-- The list position (0-based) of a player's cell number (1-based). Only meaningful for
numbers that passed the legality check; for `0` it would wrongly give position 0. -/
def position (n : Nat) : Nat := n - 1

/-- `apply`: the board after the move. It returns a new board and never changes the old one.
It assumes the move is legal. -/
def apply : Move → Board → Board
  | swap x y, b =>
    mapWithIndex (fun i blk =>
      if i = position x then b.getD (position y) blk
      else if i = position y then b.getD (position x) blk
      else blk) b
  | paint i c, b =>
    mapWithIndex (fun j blk => if j = position i then { blk with color := c } else blk) b
  | rotate i, b =>
    mapWithIndex
      (fun j blk => if j = position i then { blk with facing := blk.facing + 1 } else blk) b

/-- `step`: check the move, then apply it. -/
def step (L : Level) (b : Board) (m : Move) : Except Illegal Board :=
  match m.whyIllegal L b with
  | some why => .error why
  | none     => .ok (m.apply b)

/-- Run moves in order and stop at the first illegal one (decision A2).
`foldlM` in `Except` does the stopping: once a step returns an error, the remaining
moves are skipped. The error carries the index of the failing move (0 = first). -/
def runAll (L : Level) (b : Board) (ms : List Move) : Except (Nat × Illegal) Board :=
  (mapWithIndex Prod.mk ms).foldlM
    (fun board (i, m) => (step L board m).mapError (i, ·)) b

end Move

/-- Join words the way English does: `joinWords "or" ["a", "b", "c"] = "a, b or c"`. -/
def joinWords (conj : String) (ws : List String) : String :=
  match ws.reverse with
  | []           => ""
  | [w]          => w
  | last :: rest => ", ".intercalate rest.reverse ++ s!" {conj} {last}"

/-- The player-facing message for an illegal move (Learning Log, decision D). -/
def Illegal.message (L : Level) (b : Board) : Illegal → String
  | .noSuchCell [c] => s!"Cell {c} doesn't exist. This board has cells 1–{b.length}."
  | .noSuchCell cs =>
    let which := joinWords "and" (cs.map toString)
    s!"Cells {which} don't exist. This board has cells 1–{b.length}."
  | .locked [c] => s!"Cell {c} is locked and can't be moved, painted or rotated."
  | .locked cs =>
    let which := joinWords "and" (cs.map toString)
    s!"Cells {which} are locked and can't be moved, painted or rotated."
  | .colorNotAllowed c =>
    let allowed := joinWords "or" (L.palette.map Color.name)
    s!"{c.name.capitalize} isn't available here. You can use {allowed}."

end Tactile
