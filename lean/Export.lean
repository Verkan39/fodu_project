import Tactile

/-!
# Export the levels as JSON

The web app can't read Lean, so this prints the levels (and, separately, their reference
solutions) as JSON. The data comes straight from `Tactile/Levels.lean`, so the browser and the
checker can never disagree about a board.

```
docker compose -f docker/compose.yaml run --rm -T lean lake env lean --run Export.lean            > levels.json
docker compose -f docker/compose.yaml run --rm -T lean lake env lean --run Export.lean solutions  > solutions.json
```

Shape of one level (a block is `[colour, facing]`, facing 0 = up, 1 = right, 2 = down, 3 = left):

```
"L3": { "width": 3, "locked": [], "palette": ["yellow", ...], "lineLimit": 6,
        "start": [["pink", 1], ...], "target": [["pink", 0], ...] }
```

`lineLimit` is `null` when a level has no limit. Cell numbers are 1-based, as players see them.
The sample level used by the tests is exported too, as `"example"`.
-/

open Tactile Tactile.Levels

def quote (s : String) : String := "\"" ++ s ++ "\""

def list (xs : List String) : String := "[" ++ ",".intercalate xs ++ "]"

def blockJson (b : Block) : String := list [quote b.color.name, toString b.facing.val]

def boardJson (b : Board) : String := list (b.map blockJson)

def levelJson (L : Level) (start target : Board) : String :=
  let limit := match L.lineLimit with
    | some n => toString n
    | none   => "null"
  "{" ++ ",".intercalate [
    s!"\"width\":{L.width}",
    s!"\"locked\":{list (L.locked.map toString)}",
    s!"\"palette\":{list (L.palette.map fun c => quote c.name)}",
    s!"\"lineLimit\":{limit}",
    s!"\"start\":{boardJson start}",
    s!"\"target\":{boardJson target}"
  ] ++ "}"

def moveJson : Move → String
  | .swap a b  => list [quote "swap", toString a, toString b]
  | .paint i c => list [quote "paint", toString i, quote c.name]
  | .rotate i  => list [quote "rotate", toString i]

def solutionJson (ms : List Move) : String := list (ms.map moveJson)

def printObject (fields : List (String × String)) : IO Unit := do
  IO.println "{"
  let n := fields.length
  for (i, (k, v)) in (List.range n).zip fields do
    IO.println s!"  {quote k}: {v}{if i + 1 < n then "," else ""}"
  IO.println "}"

def main (args : List String) : IO Unit := do
  if args == ["solutions"] then
    printObject [
      ("L1", solutionJson L1.solution), ("L2", solutionJson L2.solution),
      ("L3", solutionJson L3.solution), ("L4", solutionJson L4.solution),
      ("L5", solutionJson L5.solution), ("L6", solutionJson L6.solution)
    ]
  else
    printObject [
      ("example", levelJson Examples.level Examples.start Examples.target),
      ("L1", levelJson L1.level L1.start L1.target), ("L2", levelJson L2.level L2.start L2.target),
      ("L3", levelJson L3.level L3.start L3.target), ("L4", levelJson L4.level L4.start L4.target),
      ("L5", levelJson L5.level L5.start L5.target), ("L6", levelJson L6.level L6.start L6.target)
    ]
