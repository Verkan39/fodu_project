import Tactile.Move

/-!
# A sample level

Shared by the tests and the demo. Drawn as text it looks like this
(`[ ]` marks a locked cell):

```
 A↑  C↑  V→      cells 0 1 2
 J↑ [I↓] A←      cells 3 4 5
 C→  V↑  J↑      cells 6 7 8
```
-/

namespace Tactile.Examples

def level : Level where
  width   := 3
  locked  := [4]
  palette := [.amber, .cyan, .jade]

def start : Board :=
  [ ⟨.amber, 0⟩, ⟨.cyan, 0⟩,  ⟨.violet, 1⟩,
    ⟨.jade, 0⟩,  ⟨.ivory, 2⟩, ⟨.amber, 3⟩,
    ⟨.cyan, 1⟩,  ⟨.violet, 0⟩, ⟨.jade, 0⟩ ]

end Tactile.Examples
