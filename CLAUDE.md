# the-citadel — Claude Context

## Project Overview

A fullstack playtesting management tool for **A Game of Thrones: The Card Game (LCG)**. Manages draft/playtest cards, reviews, suggestions, and Discord/GitHub integration.

Stack: React + TipTap (frontend), Node/Express + Redis (backend), shared `common/` models.

---

## Artwork System

### Model (`common/models/artwork.ts`)

Owns the artwork lane end to end — the status/type constants live here, and `common/models/slots.ts` re-exports them so a slot's three lanes stay importable together. The dependency runs one way: `slots.ts` imports from `artwork.ts`, never the reverse.

`IArtworkProgress` holds `status`, `type`, and **three side-by-side detail blocks** (`sourced`, `commissioned`, `ai`). They are deliberately not a union — switching type must not discard what was already gathered under the old one.

| Concept                     | Notes                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ArtworkContactState`       | `none → contacted → responded → granted`, with `denied` off to the side. One progression, not separate flags, so impossible combinations can't be represented. `ContactPicker` draws the run as chevrons and **denied as a separate button** — it isn't a step, it's the run being called off, so while it holds the chevrons grey out and go inert. Un-denying lands on `responded` |
| `ISourcedOption.ffg`        | Existing FFG-owned art. **Purely informational** — never satisfies the permission gate; the manager decides                                                                                                                                                                                                                                                                          |
| `IArtist.blanketPermission` | Stands in for a granted reply, since it was granted once for everything                                                                                                                                                                                                                                                                                                              |
| `IArtworkPrep`              | `{ flag, done }`. Advisory only — outstanding prep never blocks a status, and rides in the checklist as **a single row** listing every flag with the handled ones struck through, rather than a row each: six chores reading as loudly as the work which actually gates the artwork is how the two get confused. Edited as **one tri-state control** cycling not-needed → needed → done, since two checkboxes can express "done but not needed" and this can't                                                                                                                                                              |

### Status — derived, not driven

**The status is a consequence of the details, never a gate on them.** This is the single most important rule; violating it deadlocks the UI (a card can't be repaired if the repair is what's being blocked).

| Status     | How it's set                                   |
| ---------- | ---------------------------------------------- |
| Pending    | Derived — no type chosen                       |
| Acquiring  | Derived — type chosen, artwork not yet in hand |
| Confirming | Derived — artwork in hand and permitted        |
| Complete   | **Manual only** — never awarded automatically  |

- `inferredStatus()` re-derives on every detail change, **including backwards** — clearing a final artwork drops Confirming to Acquiring.
- Complete is never _awarded_ by automation, but it **is given up** when the data no longer supports Confirming-level requirements. A card can't stay finished once its artwork is gone.
- `inferredStatus` delegates the advance decision to `artworkBlocker` rather than re-checking the rules, so automation can never pick a status the API would refuse.
- Saving details that move the status opens `confirmStatusChangeModal.tsx` first — from → to with the lane icons, and `statusReason()` for why. Automation deciding the track is the design; deciding it _silently_ isn't.
- Manual override lives **only** in `artworkStatusModal.tsx`. Unsupported statuses render disabled with their reason via `StatusStepper`'s per-step `isDisabled`/`disabledReason` — offered-and-explained, never picked-then-refused.

### Gating — `artworkBlocker(artwork, target, artists)`

Shared by the API and the UI so the refusal and the on-screen reason are the same sentence. Returns `undefined` when the status is reachable — the first unmet entry of `artworkRequirements()`, which is the one statement of the rules. The checklist at the top of the tab renders that same list with its `done` flags, so what a person is told is left and what the API insists on cannot drift apart. It deliberately says nothing about the status: where the track lands is settled at the point of saving, by `confirmStatusChangeModal`.

| Transition            | Sourced                          | Commissioned         | AI          |
| --------------------- | -------------------------------- | -------------------- | ----------- |
| → acquiring           | type chosen                      | type chosen          | type chosen |
| → confirming/complete | selected option, permission held | artist + artwork url | artwork url |

Enforced in `PATCH /projects/:number/slots/:slot` **only when the artwork status is actually changing**. A record already sitting at a status it no longer satisfies must stay editable, or repairing the details it's missing would be impossible.

Field validation is separate from the gate and runs the site's usual way: `useFormValidation(Slot.ArtworkProgress)` + a HeroUI `Form` carrying `validationErrors`, exactly as `releaseChecksModal.tsx` does it. `Slot.ArtworkProgress` is the same Joi object PATCH validates, so nothing is mirrored in client code — each input's `name` is its schema path (`ai.url`, `sourced.options.0.url`), and anything left over lands in `FormValidationSummary`, since only the current type's panel is mounted. `EditArtistModal` follows the same pattern against `Artist.Draft`.

Links go through the shared `Link` rule in `schemas.ts` — whole `http(s)` addresses, blank always fine. `artworkUrlIssue()` still mirrors it, but only to decide whether a link is worth pointing an `<img>` at.

> Clients without `READ_ARTISTS` skip the client-side gate entirely (`artworkTab.tsx`, `artworkSummary.ts`). Blanket permission can't be judged without the artist list, and guessing would refuse a save the server would have taken.

### Storage

**Artwork is a URL. Nothing is stored server-side.** `ArtworkImage` renders straight from the host with skeleton/loaded/failed states — a dead link gets its own "image unavailable" state rather than a broken icon, since it's a real outcome. The frame is a fixed shape but the piece is `object-contain`, never cropped to fill it: artwork arrives in every ratio, and a crop hides the part being judged.

`displayableUrls()` returns **every host worth trying**, best first, because a Drive link points at a viewer page and an `<img>` aimed at one receives HTML. Drive serves the same file from two hosts that fail independently — `drive.google.com/thumbnail?id={id}&sz=w1600` (fast, reliable, size-capped) then `lh3.googleusercontent.com/d/{id}` (original, rate-limits). `ArtworkImage` walks the list on error and only reports failure once all are spent; that inconsistency is what made a piece which loaded yesterday read as missing today. Either host only works while the file is shared with anyone holding the link, so a Drive image that won't load from both is nearly always a sharing setting — the failure state says so.

GridFS upload was considered and deferred; Drive archiving remains pencilled in for a later update.

### UI

- `client/src/pages/card/artwork/` — the card's **Artwork** tab (`cardDetail.tsx` now has Development/Artwork tabs). One dirty-tracked save writes the whole artwork block.
- `client/src/pages/project/artworks/` — the project's **Artworks** tab, between Development and Releases. Composes cached slots/cards/artists queries; no dedicated endpoint.
- `client/src/components/artwork/` — shared: `ArtworkImage`, `ArtworkReveal`, `ArtistSelect`, `CostInput`, `EditArtistModal`.
    - `ArtistSelect` shows **one** square button sized to the field (not to the button scale — a labelled HeroUI field is taller): add when nothing is picked, edit when something is.
    - `ArtworkReveal` is the canvas for artwork which may not exist yet — nothing is reserved until there is a whole link worth drawing, and the frame opens into the space the fields give up. `layout` is on only for the length of that reveal, or every unrelated reflow above it slides the whole row too.
    - `CostInput` is one money field: the amount formats itself in the chosen currency, whose code is picked from a compact `Select` in `endContent`. Amount and currency are entered and cleared **together** — emptying the amount drops the pair, which is the only way to record "no cost". Symbols come from `Intl.NumberFormat` with **`currencyDisplay: "narrowSymbol"`** — the default gives "US$", not "$". `formatCurrency` in `client/src/utils.tsx` defaults to the same, so a cost reads identically in the editor and in the project list.
    - `EditArtistModal`'s danger zone deletes. Whether anything still credits the artist is only knowable server-side (`slots.byArtist`), so the button is always live and the server's refusal is surfaced verbatim rather than guessed at client-side.
- The Artwork lane capsule in `cardProgress.tsx` opens `artworkStatusModal.tsx` (manual status only), which links through to the full tab via `useHistoryState("tab")`.
- `components/statusNotice.tsx` — the slim "where this stands" line used above the artwork detail. Deliberately **not** a HeroUI `Alert`: an alert announces a problem and takes the room to match, where these are a record's steady state and sit there permanently.
- `components/actions/processActions.tsx` — the actions that move a record on (Save, Discard, Add option). Icon + text at the foot on desktop; on a phone they lift into the floating column left of the page's own FAB (`bottom-6 right-20`, filling leftwards), so they stay reachable however far down the form you are. One component, not two sets of markup — that drift is how a save button ends up existing on only one breakpoint. The mobile column is **portalled to `document.body`**: a transformed ancestor (`SlidingPages`, carrying the artwork editor) makes a `fixed` child position against that ancestor instead of the viewport, and the buttons disappear. Because there is one floating column per page, the owning page holds the whole action list: `artworkTab.tsx` supplies **Add option** as well, and `SourcedPanel` renders its own copy desktop-only.
- Sourced options drag with a **`DragOverlay` + `dropAnimation`**, the same pattern as the release board (it reuses `releaseDnd.ts`'s exported `dropAnimation`). Dragged in place, the carried card has no flight of its own — the others slide aside and it appears in the gap. Framer's `layout` on the row wrapper is switched off for the length of the drop, or it animates the same move a second time from pre-drag measurements and pulls the list out from under the overlay.
- The project's Artworks list is built as **one flat run of `ListEntry` values** — release headers and card rows as siblings — not rows nested inside an element per group. A grouped wrapper has to be keyed by its release, so turning grouping on or off changes that key and React unmounts every row inside it; they remount rather than move, and a layout animation has nothing to animate. Measured on the real page, a row jumped 6210px in two frames before this and travelled it across 21 after. Rows reorder with `layout` inside `<AnimatePresence mode="popLayout">` (the default holds a leaving row's space until its fade ends, so survivors can't start moving), and carry `w-full` because popLayout lifts exiting entries out of flow.
- `components/slidingPages.tsx` — the Wizard's slide-and-measure behaviour extracted for reuse. `WizardPages` is now a thin wrapper over it, and the project's Artworks tab uses it to travel to the artwork editor rather than opening a dialog.
- Progress % is **status-driven, unchanged** — `cardLaneBreakdown` was deliberately not touched, so one definition of progress holds everywhere.

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
