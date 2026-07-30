# the-citadel — Claude Context

## Project Overview

A fullstack playtesting management tool for **A Game of Thrones: The Card Game (LCG)**. Manages draft/playtest cards, reviews, suggestions, and Discord/GitHub integration.

Stack: React + TipTap (frontend), Node/Express + Redis (backend), shared `common/` models.

---

## Card Editor System

### `CardEditor` (`client/src/components/cardEditor/index.tsx`)

The main orchestrator component. Manages `DeepPartial<ICard>` state and controls field visibility/availability via two mechanisms:

- **`inputOptions`** prop: per-field `"disabled"` or `"hidden"` override
- **`visibility` state**: computed from `card.type` and `card.faction` — determines which fields are structurally applicable

Key behavior: `applyDefaults()` adds/removes fields based on type (e.g. `icons` only on `character`, `unique` on `char/attach/location`, `loyal` only for non-neutral factions).

---

### AbilityTextEditor (`client/src/components/cardEditor/components/abilityEditor.tsx`)

TipTap rich-text editor for card ability text.

#### Text Format (storage ↔ editor)

| Storage (`card.text`)        | Editor HTML                                     |
| ---------------------------- | ----------------------------------------------- |
| `\n`                         | `<br>`                                          |
| `[military]` (icon)          | `<span data-thrones-icon="military">` atom node |
| Plain text                   | Plain text                                      |
| `***trait text***`           | Converts to `<i style="font-weight:700">` mark  |
| `Action:` / `Reaction:` etc. | Converts to `<b>` mark                          |

- **Incoming** (`convertIncomingText`): replaces `\n` → `<br>`, passes to `setContent`
- **Outgoing** (`convertOutgoingHtml`): replaces `<br>` → `\n`, then strips icon spans → `[name]`
    - **KNOWN BUG**: the strip regex `/<span>\[(\w+)\]<\/span>/g` does NOT match TipTap's actual output `<span data-thrones-icon="name">[name]</span>` (which includes the attribute). Icons may not round-trip cleanly to plain text.

#### External sync (`useEffect` in `AbilityEditor`)

Syncs external `value` into the editor when NOT focused, using plain-text comparison (`editor.getText()` vs `text`). Because icon nodes render as Unicode in `getText()` but `text` contains `[iconname]`, these will never match — so the editor always resets on blur when icons are present.

---

### TipTap Extensions (`client/src/components/cardEditor/components/abilityEditorExtensions.tsx`)

#### `TriggeredAbility` (Mark → `<b>`)

- Auto-applied by `AutoTextConversions` when line starts with ability keyword prefix (see `ABILITY_TEXT_REGEX`)
- Mutually exclusive with `Trait` mark
- **Backspace handler**: instead of deleting a character, removes the mark from the whole paragraph and sets `markRemovedKey` meta to prevent immediate re-application

#### `Trait` (Mark → `<i style="font-weight:700">`)

- Auto-applied when `***text***` is typed (strips asterisks, wraps inner text)
- Mutually exclusive with `TriggeredAbility` mark
- Same Backspace handler pattern as `TriggeredAbility`
- Note: `addOptions` sets `class: "italics"` (wrong CSS name; actual styling comes from `<i>` tag + inline style)

#### `AutoTextConversions` (Extension — ProseMirror `appendTransaction` plugin)

Watches for non-history doc changes and applies three auto-conversions in a single transaction:

1. `***text***` → Trait mark (strips `***` wrapper)
2. `ABILITY_TEXT_REGEX` match → TriggeredAbility mark
3. `:iconname:` or `[iconname]` → AbilityIcon node (if name is a valid `abilityIcons` key)

Key details:

- Skips if the transaction was its own (via `autoConvertKey` meta)
- Skips history-only transactions (`addToHistory === false`)
- Respects `markRemovedKey` to avoid re-applying a mark the user just backspace-removed
- Processes all `pending` replacements sorted **descending by position** to avoid position drift

#### `AbilityIcon` (Node — inline atom)

- Stored in HTML as `<span data-thrones-icon="name">[name]</span>`
- NodeView renders as `<span class="font-thronesdb">` with Unicode char from `abilityIcons` map
- Insert command: `editor.chain().focus().insertThronesIcon(iconName).run()`

#### `NewLine` (HardBreak extension)

Overrides `Enter` to always insert a `<br>` (hard break) instead of a new block.

---

### Key Regexes

```
ABILITY_TEXT_REGEX  /^((?:(?:Forced )?(?:Reaction|Interrupt)|(?:When Revealed)|(?:(?:Plot |Draw |Marshaling |Challenges |Dominance |Standing |Taxation )?Action)):)/
TRAIT_HIGHLIGHT_REGEX  /\*\*\*(.+?)\*\*\*/
ICON_REGEX  /(?::([a-zA-Z0-9_]+):|\[([a-zA-Z0-9_]+)\])/
```

---

### `abilityIcons` (`common/utils.ts`)

Maps icon name → ThronesDB font Unicode character. Valid icon names (used in both the toolbar and ICON_REGEX matching):
`military, intrigue, power, baratheon, greyjoy, lannister, martell, thenightswatch, stark, targaryen, tyrell`

---

### Other Editor Components (`client/src/components/cardEditor/components/editorComponents.tsx`)

| Component              | Field       | Notes                                                |
| ---------------------- | ----------- | ---------------------------------------------------- |
| `FactionSelect`        | `faction`   | Dropdown with thrones icons                          |
| `TypeSelect`           | `type`      | Dropdown with type icons                             |
| `UniqueButton`         | `unique`    | Toggle, only shown for char/attach/location          |
| `LoyalButton`          | `loyal`     | Toggle, only shown for non-neutral factions          |
| `CostInput`            | `cost`      | Parses number, `"X"`, or `"-"`                       |
| `StrengthInput`        | `strength`  | Parses number or `"X"`                               |
| `ChallengeIconButtons` | `icons`     | Three-button toggle group, character only            |
| `TraitsInput`          | `traits`    | ComboBox, adds on Enter or `.`, strips trailing dots |
| `PlotStatInputs`       | `plotStats` | 2×2 grid: income, initiative, claim, reserve         |

---

### Data Models (`common/models/cards.ts`)

- `ICard`: base card (faction, type, name, text, traits, cost, strength, icons, plotStats, etc.)
- `IPlaytestCard extends ICard`: adds project, number, version, draft, note, github, discord
- `Cost`: `number | "X" | "-"`
- `Strength`: `number | "X"`
- `PlotValue`: `number | "X"`

---

## Known / Suspected Bugs

### 1. `convertOutgoingHtml` icon regex mismatch — FIXED

**File**: `client/src/components/cardEditor/components/abilityEditor.tsx:18`

Was: `/<span>\[(\w+)\]<\/span>/g` — didn't match TipTap's actual output `<span data-thrones-icon="name">[name]</span>`.
Fixed to: `/<span[^>]*data-thrones-icon="(\w+)"[^>]*>[^<]*<\/span>/g`

### 2. Plain-text sync comparison includes icons — FIXED

**File**: `client/src/components/cardEditor/components/abilityEditor.tsx:48-52`

Was: comparing `editor.getText()` (Unicode chars) against `text` (`[iconname]`) — never equal, editor always reset on blur.
Fixed to: compare `convertOutgoingHtml(editor.getHTML()) || undefined` against `text` — same representation on both sides.
