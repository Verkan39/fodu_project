import Tactile.Move

/-!
# A sample level

Shared by the tests and the demo. Drawn as text it looks like this
(`[ ]` marks a locked cell). Cell numbers are 1-based, as players see them:

```
 Y↑  B↑  P→      cells 1 2 3
 G↑ [W↓] Y←      cells 4 5 6
 B→  P↑  G↑      cells 7 8 9
```
-/

namespace Tactile.Examples

def level : Level where
  width   := 3
  locked  := [5]
  palette := [.yellow, .blue, .green]

def start : Board :=
  [ ⟨.yellow, 0⟩, ⟨.blue, 0⟩,  ⟨.pink, 1⟩,
    ⟨.green, 0⟩,  ⟨.white, 2⟩, ⟨.yellow, 3⟩,
    ⟨.blue, 1⟩,   ⟨.pink, 0⟩,  ⟨.green, 0⟩ ]

/-- A target that `start` reaches with `swap 1 3`, `paint 3 blue`, `rotate 3`. -/
def target : Board :=
  [Move.swap 1 3, .paint 3 .blue, .rotate 3].foldl (fun b m => m.apply b) start

end Tactile.Examples
