import Tactile.Move

/-!
# The six levels

Designed in the Learning Log, Entries 6 and 7. Cells are **1-based** in reading order.
Facing: `0` = ↑, `1` = →, `2` = ↓, `3` = ←. `[ ]` marks a locked cell.

Each level has:

* `level`: width, locked cells, palette and line limit
* `start` and `target`, written out in full. The target is deliberately **not** computed from
  the solution, otherwise "the solution reaches the target" would be true by construction.
* `solution`: the reference solution with every helper expanded into plain moves. The version
  with helpers is in `LevelTests.lean`, written as a real proof.
-/

namespace Tactile.Levels

/-! ## Level 1: First Steps (one swap, one rotate, one paint)

```
start          target
 Y→ B↑ P←       Y→ P↓ P←
 G↓ W↑ Y↑       G← W↑ G↑
 B← P↓ G→       B← B↑ G→
```
-/
namespace L1

def level : Level where
  width   := 3
  locked  := []
  palette := Color.all

def start : Board :=
  [ ⟨.yellow, 1⟩, ⟨.blue, 0⟩,  ⟨.pink, 3⟩,
    ⟨.green, 2⟩,  ⟨.white, 0⟩, ⟨.yellow, 0⟩,
    ⟨.blue, 3⟩,   ⟨.pink, 2⟩,  ⟨.green, 1⟩ ]

def target : Board :=
  [ ⟨.yellow, 1⟩, ⟨.pink, 2⟩,  ⟨.pink, 3⟩,
    ⟨.green, 3⟩,  ⟨.white, 0⟩, ⟨.green, 0⟩,
    ⟨.blue, 3⟩,   ⟨.blue, 0⟩,  ⟨.green, 1⟩ ]

def solution : List Move := [.swap 2 8, .rotate 4, .paint 6 .green]

end L1

/-! ## Level 2: Locked Out

Traps: `swap 2 5` (cell 5 is locked) and `paint 2 pink` (pink isn't in the palette).

```
start            target
 G→  B↑  W←       G→  P↑  W↑
 Y↓ [P→] G↑       Y↓ [P→] G↑
 P↑  Y←  B↓       B↑  Y←  G↓
```
-/
namespace L2

def level : Level where
  width   := 3
  locked  := [5]
  palette := [.green, .blue]

def start : Board :=
  [ ⟨.green, 1⟩,  ⟨.blue, 0⟩, ⟨.white, 3⟩,
    ⟨.yellow, 2⟩, ⟨.pink, 1⟩, ⟨.green, 0⟩,
    ⟨.pink, 0⟩,   ⟨.yellow, 3⟩, ⟨.blue, 2⟩ ]

def target : Board :=
  [ ⟨.green, 1⟩,  ⟨.pink, 0⟩, ⟨.white, 0⟩,
    ⟨.yellow, 2⟩, ⟨.pink, 1⟩, ⟨.green, 0⟩,
    ⟨.blue, 0⟩,   ⟨.yellow, 3⟩, ⟨.green, 2⟩ ]

def solution : List Move := [.swap 2 7, .paint 9 .green, .rotate 3]

end L2

/-! ## Level 3: Name It (a helper is required)

Every top-row block needs three quarter turns, so plain moves take 9 lines. With the helper
`spin3` (`rotate 1; rotate 2; rotate 3`) called three times it is 3 + 3 = 6.

```
start          target
 P→ W→ G→       P↑ W↑ G↑
 Y↓ B← P↑       Y↓ B← P↑
 W↑ Y→ B↓       W↑ Y→ B↓
```
-/
namespace L3

def level : Level where
  width     := 3
  locked    := []
  palette   := Color.all
  lineLimit := some 6

def start : Board :=
  [ ⟨.pink, 1⟩,   ⟨.white, 1⟩, ⟨.green, 1⟩,
    ⟨.yellow, 2⟩, ⟨.blue, 3⟩,  ⟨.pink, 0⟩,
    ⟨.white, 0⟩,  ⟨.yellow, 1⟩, ⟨.blue, 2⟩ ]

def target : Board :=
  [ ⟨.pink, 0⟩,   ⟨.white, 0⟩, ⟨.green, 0⟩,
    ⟨.yellow, 2⟩, ⟨.blue, 3⟩,  ⟨.pink, 0⟩,
    ⟨.white, 0⟩,  ⟨.yellow, 1⟩, ⟨.blue, 2⟩ ]

def spin3 : List Move := [.rotate 1, .rotate 2, .rotate 3]

def solution : List Move := spin3 ++ spin3 ++ spin3

end L3

/-! ## Level 4: See the Shortcut (line limit = the optimal 5)

* cells 2 and 14: same colour, facings swapped, so one swap beats four rotates
* cells 3 and 9: green and blue in each other's place, so one swap beats two paints
* cells 1 → 7 → 12: a three-way cycle, so two swaps, not three
* order trap: painting 12 before rescuing its white leaves too few movable whites

```
start                  target
 Y→  B↑  G↓  W←         P→  B→  B↓  W←
 G→ [P↑] P→  Y↓         G→ [P↑] W→  Y↓
 B↓  P← [W↑] W→         G↓  P← [W↑] G→
 Y←  B→  G↑  B←         Y←  B↑  G↑  B←
```
-/
namespace L4

def level : Level where
  width     := 4
  locked    := [6, 11]
  palette   := [.green, .blue]
  lineLimit := some 5

def start : Board :=
  [ ⟨.yellow, 1⟩, ⟨.blue, 0⟩, ⟨.green, 2⟩, ⟨.white, 3⟩,
    ⟨.green, 1⟩,  ⟨.pink, 0⟩, ⟨.pink, 1⟩,  ⟨.yellow, 2⟩,
    ⟨.blue, 2⟩,   ⟨.pink, 3⟩, ⟨.white, 0⟩, ⟨.white, 1⟩,
    ⟨.yellow, 3⟩, ⟨.blue, 1⟩, ⟨.green, 0⟩, ⟨.blue, 3⟩ ]

def target : Board :=
  [ ⟨.pink, 1⟩,   ⟨.blue, 1⟩, ⟨.blue, 2⟩,  ⟨.white, 3⟩,
    ⟨.green, 1⟩,  ⟨.pink, 0⟩, ⟨.white, 1⟩, ⟨.yellow, 2⟩,
    ⟨.green, 2⟩,  ⟨.pink, 3⟩, ⟨.white, 0⟩, ⟨.green, 1⟩,
    ⟨.yellow, 3⟩, ⟨.blue, 0⟩, ⟨.green, 0⟩, ⟨.blue, 3⟩ ]

def solution : List Move :=
  [.swap 1 7, .swap 7 12, .paint 12 .green, .swap 2 14, .swap 3 9]

end L4

/-! ## Level 5: Recipe (a helper with a parameter)

`fix i` = `paint i green; rotate i; rotate i`. Plain moves take 16 lines; with the helper it is
3 + 1 + 5 = 9. Order trap: `fix 7` before `swap 2 7` paints over the only movable pink.

```
start                  target
 Y↑  B→  W↓  B→         G↓  P↓  W↓  G←
 W← [G↓] P↓  Y→         W← [G↓] G←  Y→
 B↑  Y← [G→] W↑         B↑  Y← [G→] W↑
 W↑  B↓  Y←  Y→         G↓  B↓  Y←  G←
```
-/
namespace L5

def level : Level where
  width     := 4
  locked    := [6, 11]
  palette   := [.green, .blue]
  lineLimit := some 9

def start : Board :=
  [ ⟨.yellow, 0⟩, ⟨.blue, 1⟩,   ⟨.white, 2⟩, ⟨.blue, 1⟩,
    ⟨.white, 3⟩,  ⟨.green, 2⟩,  ⟨.pink, 2⟩,  ⟨.yellow, 1⟩,
    ⟨.blue, 0⟩,   ⟨.yellow, 3⟩, ⟨.green, 1⟩, ⟨.white, 0⟩,
    ⟨.white, 0⟩,  ⟨.blue, 2⟩,   ⟨.yellow, 3⟩, ⟨.yellow, 1⟩ ]

def target : Board :=
  [ ⟨.green, 2⟩, ⟨.pink, 2⟩,   ⟨.white, 2⟩, ⟨.green, 3⟩,
    ⟨.white, 3⟩, ⟨.green, 2⟩,  ⟨.green, 3⟩, ⟨.yellow, 1⟩,
    ⟨.blue, 0⟩,  ⟨.yellow, 3⟩, ⟨.green, 1⟩, ⟨.white, 0⟩,
    ⟨.green, 2⟩, ⟨.blue, 2⟩,   ⟨.yellow, 3⟩, ⟨.green, 3⟩ ]

def fix (i : Nat) : List Move := [.paint i .green, .rotate i, .rotate i]

def solution : List Move :=
  [.swap 2 7] ++ fix 7 ++ fix 1 ++ fix 4 ++ fix 13 ++ fix 16

end L5

/-! ## Level 6: Everything (line limit = the optimal 11)

`back i` = `rotate i` three times. 3 + 8 = 11 lines; plain moves take 16.

* cells 6 → 11: rescue the only movable pink, then paint cell 6 white
* cells 2 and 14: same colour, facings swapped, so one swap
* cells 3 and 15: yellow and white in each other's place, so one swap, not two paints
* corners 1, 4, 13, 16: one anticlockwise turn each

```
start                  target
 G↑  B↓  Y←  Y↑         G←  B→  W←  Y←
 W→  P↑ [P↓] B←         W→  W↑ [P↓] B←
 Y↓ [G→] B↑  W↓         Y↓ [G→] P↑  W↓
 B↑  B→  W←  G↑         B←  B↓  Y←  G←
```
-/
namespace L6

def level : Level where
  width     := 4
  locked    := [7, 10]
  palette   := [.white, .yellow]
  lineLimit := some 11

def start : Board :=
  [ ⟨.green, 0⟩,  ⟨.blue, 2⟩,  ⟨.yellow, 3⟩, ⟨.yellow, 0⟩,
    ⟨.white, 1⟩,  ⟨.pink, 0⟩,  ⟨.pink, 2⟩,   ⟨.blue, 3⟩,
    ⟨.yellow, 2⟩, ⟨.green, 1⟩, ⟨.blue, 0⟩,   ⟨.white, 2⟩,
    ⟨.blue, 0⟩,   ⟨.blue, 1⟩,  ⟨.white, 3⟩,  ⟨.green, 0⟩ ]

def target : Board :=
  [ ⟨.green, 3⟩,  ⟨.blue, 1⟩,  ⟨.white, 3⟩,  ⟨.yellow, 3⟩,
    ⟨.white, 1⟩,  ⟨.white, 0⟩, ⟨.pink, 2⟩,   ⟨.blue, 3⟩,
    ⟨.yellow, 2⟩, ⟨.green, 1⟩, ⟨.pink, 0⟩,   ⟨.white, 2⟩,
    ⟨.blue, 3⟩,   ⟨.blue, 2⟩,  ⟨.yellow, 3⟩, ⟨.green, 3⟩ ]

def back (i : Nat) : List Move := [.rotate i, .rotate i, .rotate i]

def solution : List Move :=
  [.swap 6 11, .paint 6 .white, .swap 2 14, .swap 3 15] ++ back 1 ++ back 4 ++ back 13 ++ back 16

end L6

end Tactile.Levels
