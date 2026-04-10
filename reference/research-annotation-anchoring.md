# Research: Mapping HTML Rendered Text Selections to Markdown Source Lines

**Date**: 2026-04-06  
**Context**: Building a markdown annotation/review tool where users select text in rendered HTML, but annotations must be anchored to markdown SOURCE lines. Annotations must survive markdown edits (re-anchoring).

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Hypothes.is — Fuzzy Multi-Selector Anchoring](#2-hypothesis--fuzzy-multi-selector-anchoring)
3. [W3C Web Annotation Data Model — The Standard](#3-w3c-web-annotation-data-model--the-standard)
4. [Apache Annotator — Reference Implementation](#4-apache-annotator--reference-implementation)
5. [markdown-it — Source Line Mapping via Token.map](#5-markdown-it--source-line-mapping-via-tokenmap)
6. [VS Code Markdown Preview — Bidirectional Scroll Sync](#6-vs-code-markdown-preview--bidirectional-scroll-sync)
7. [Remark/Unified — AST Position Tracking](#7-remarkunified--ast-position-tracking)
8. [position-map-text-to-markdown — Reverse Mapping Library](#8-position-map-text-to-markdown--reverse-mapping-library)
9. [ProseMirror — Marks, Decorations, and Position Mapping](#9-prosemirror--marks-decorations-and-position-mapping)
10. [Yjs Y.RelativePosition — CRDT-Based Stable Anchors](#10-yjs-yrelativeposition--crdt-based-stable-anchors)
11. [Google diff-match-patch — Fuzzy Matching and Patching](#11-google-diff-match-patch--fuzzy-matching-and-patching)
12. [Google Docs / Notion — OT/CRDT Comment Systems](#12-google-docs--notion--otcrdt-comment-systems)
13. [Dual-Pane Sync Scrolling Patterns](#13-dual-pane-sync-scrolling-patterns)
14. [Synthesis: Recommended Architecture](#14-synthesis-recommended-architecture)

---

## 1. Problem Statement

The core challenge has three sub-problems:

1. **Forward mapping**: Markdown source line N → which HTML element(s) does it produce?
2. **Reverse mapping**: User selects text in rendered HTML → which markdown source line(s) does it correspond to?
3. **Re-anchoring**: Markdown source changes → can we relocate the annotation to the right place?

These are distinct problems requiring different techniques. The research below covers proven approaches to each.

---

## 2. Hypothes.is — Fuzzy Multi-Selector Anchoring

**Source**: [Hypothesis Client](https://github.com/hypothesis/client/tree/main/src/annotator/anchoring) | [Fuzzy Anchoring Blog](https://web.hypothes.is/blog/fuzzy-anchoring/)

### How It Anchors

Hypothesis stores **three selectors** for every annotation, each describing the same target text differently:

```json
{
  "target": [{
    "selector": [
      {
        "type": "RangeSelector",
        "startContainer": "/div[1]/p[3]",
        "startOffset": 12,
        "endContainer": "/div[1]/p[3]",
        "endOffset": 46
      },
      {
        "type": "TextPositionSelector",
        "start": 412,
        "end": 446
      },
      {
        "type": "TextQuoteSelector",
        "exact": "the selected text goes here",
        "prefix": "preceding context ",
        "suffix": " following context"
      }
    ]
  }]
}
```

### Anchoring Strategy (Fallback Chain)

When re-anchoring, Hypothesis tries selectors in this order:

1. **RangeSelector** (XPath + offset pairs) — fastest, most brittle
2. **TextPositionSelector** (character offset in document.textContent) — fast, brittle to any edit
3. **TextQuoteSelector** (exact text + prefix/suffix context) — slowest, most robust

Each attempt is wrapped in a Promise `.catch()` chain, falling through to the next strategy on failure.

### Fuzzy Matching Algorithm

The `match-quote.ts` module implements a two-phase approach:

**Phase 1 — Exact Match**: Fast `indexOf()` search for the exact quote text.

**Phase 2 — Fuzzy Match**: If exact fails, uses the `approx-string-match` library (Myers' bit-parallel algorithm, O((k/w)*n)) with:
- Max errors: `Math.min(256, quote.length / 2)`
- Results scored by weighted composite:
  - Quote similarity: weight **50**
  - Prefix match: weight **20**
  - Suffix match: weight **20**
  - Position proximity (to expected location): weight **2**

```typescript
// Simplified scoring from match-quote.ts
export function matchQuote(
  text: string,
  quote: string,
  context: { prefix?: string; suffix?: string; hint?: number }
): Match | null
```

### Key Source Files

- `html.ts` — `describe()` creates selectors, `anchor()` re-anchors them
- `match-quote.ts` — fuzzy matching with scoring
- `text-range.ts` — TextPosition/TextRange conversion between DOM and offsets
- `xpath.ts` — XPath-based element identification

### Strengths
- Battle-tested on millions of annotations across arbitrary web pages
- Graceful degradation through fallback chain
- Fuzzy matching survives moderate edits (insertions, deletions, reflows)

### Weaknesses
- Designed for HTML DOM, not markdown source lines
- TextQuoteSelector fuzzy search is slow on large documents
- No awareness of markdown structure (headings, lists, code blocks)

### Applicability
**High** for the re-anchoring strategy. The multi-selector + fuzzy fallback pattern is directly applicable. The TextQuoteSelector with prefix/suffix context is the most transferable technique.

---

## 3. W3C Web Annotation Data Model — The Standard

**Source**: [W3C Recommendation](https://www.w3.org/TR/annotation-model/) | [Vocabulary](https://www.w3.org/TR/annotation-vocab/)

### Selector Types Defined

| Selector | Purpose | Properties | Robustness |
|---|---|---|---|
| **TextQuoteSelector** | Quote text with context | `exact`, `prefix`, `suffix` | High — survives edits if text persists |
| **TextPositionSelector** | Character offsets | `start`, `end` | Low — breaks on any insertion/deletion |
| **RangeSelector** | Composite start/end | `startSelector`, `endSelector` | Medium — depends on sub-selectors |
| **XPathSelector** | DOM path | `value` (XPath expr) | Low-Medium — breaks on DOM restructuring |
| **CssSelector** | CSS path | `value` (CSS selector) | Low-Medium — breaks on DOM restructuring |
| **FragmentSelector** | URI fragment | `value`, `conformsTo` | Varies by media type |
| **DataPositionSelector** | Byte offsets | `start`, `end` | Low — binary streams only |
| **SVGSelector** | Spatial region | `value` (SVG XML) | N/A for text |

### Selector Refinement (Chaining)

Selectors can be chained via `refinedBy`, where each selector narrows the scope of the previous one:

```json
{
  "type": "CssSelector",
  "value": "#chapter3",
  "refinedBy": {
    "type": "TextQuoteSelector",
    "exact": "specific text",
    "prefix": "before ",
    "suffix": " after"
  }
}
```

### Content Change Guidance

The spec explicitly warns:
- TextPositionSelector: "Any edits or dynamically transcluded content may change the selection... it is RECOMMENDED that a State be additionally used."
- TextQuoteSelector: If multiple matches exist after processing prefix/exact/suffix, "the selection SHOULD be treated as matching all of the matches."
- Multiple selectors describing the same target is encouraged for resilience.

### Applicability
**High as a data model standard**. Use the W3C selector vocabulary for storing annotation anchors — it's interoperable and well-defined. Combine TextQuoteSelector (robust) with a custom markdown-position selector (fast).

---

## 4. Apache Annotator — Reference Implementation

**Source**: [GitHub](https://github.com/apache/incubator-annotator) | [Docs](https://annotator.apache.org/docs/)

### Architecture

Apache Annotator provides two core operations:
1. **Describe**: Given a DOM selection, create W3C selectors
2. **Anchor (Match)**: Given a W3C selector, find the corresponding DOM range

Packages:
- `@apache-annotator/dom` — DOM-specific selector creation/resolution
- `@apache-annotator/selector` — Generic selector composition utilities

### Text Quote Matching

The `match-text-quote.ts` implementation:
- Concatenates `prefix + exact + suffix` into a single search pattern
- Performs **strict character-by-character matching** (no fuzzy)
- Handles chunked text across DOM nodes via `TextNodeChunker`
- Returns matches as async generators

```typescript
// Usage
import { createTextQuoteSelectorMatcher } from '@apache-annotator/dom';

const selector = { type: 'TextQuoteSelector', exact: 'some text', prefix: 'the ', suffix: ' here' };
const matcher = createTextQuoteSelectorMatcher(selector);
for await (const range of matcher(document.body)) {
  // range is a DOM Range
}
```

### Strengths
- Clean W3C-compliant API
- Modular package architecture
- TypeScript with async generator pattern

### Weaknesses
- **No fuzzy matching** — strict equality only
- Incubator status (not production-hardened like Hypothesis)
- No built-in re-anchoring strategy when content changes

### Applicability
**Medium**. Good reference for clean selector API design, but lacks the fuzzy matching needed for content changes. Would need to be augmented with fuzzy matching (like Hypothesis does with `approx-string-match`).

---

## 5. markdown-it — Source Line Mapping via Token.map

**Source**: [Token.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/token.mjs) | [markdown-it-source-map](https://github.com/tylingsoft/markdown-it-source-map) | [markdown-it-inject-linenumbers](https://github.com/digitalmoksha/markdown-it-inject-linenumbers)

### Token.map Property

Every block-level token in markdown-it has a `map` property: `[line_begin, line_end]` (0-indexed).

```javascript
// Token class constructor
function Token(type, tag, nesting) {
  this.map = null;  // Source map info: [line_begin, line_end]
  // ...
}
```

### Injecting Source Lines into HTML

A markdown-it core rule plugin can inject `data-source-line` attributes:

```javascript
// Simplified VS Code / markdown-it-source-map approach
function pluginSourceMap(md) {
  md.core.ruler.push('source_map', function(state) {
    for (const token of state.tokens) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-line', String(token.map[0]));
        token.attrJoin('class', 'code-line');
      }
    }
  });
}

// Usage
const md = require('markdown-it')().use(pluginSourceMap);
const html = md.render('# Hello\n\nWorld');
// <h1 data-line="0" class="code-line">Hello</h1>
// <p data-line="2" class="code-line">World</p>
```

### Critical Limitation: Block-Level Only

**Token.map only exists on block-level tokens, NOT inline tokens.** This means:
- Paragraphs, headings, list items, code blocks, tables: have line mappings
- Bold text, links, inline code, images within a paragraph: **NO line mapping**

This is a fundamental constraint of markdown-it's architecture. The markdown-it maintainers have stated that inline source mapping "is a different level of complexity and is not planned."

### Available Plugins

| Plugin | Output | Notes |
|---|---|---|
| `markdown-it-source-map` | `data-source-line="N"` | Block elements only |
| `markdown-it-inject-linenumbers` | `data-source-line="N"` + `class="line"` | Block elements only; supports headings, paragraphs, list items, tables |

### Applicability
**High for the forward mapping problem**. This is the standard technique for markdown→HTML line mapping. Use it to stamp each rendered block element with its source line. For inline selections within a block, combine with TextQuoteSelector for disambiguation.

---

## 6. VS Code Markdown Preview — Bidirectional Scroll Sync

**Source**: [VS Code markdown-language-features](https://github.com/microsoft/vscode/tree/main/extensions/markdown-language-features) | [PR #134799](https://github.com/microsoft/vscode/pull/134799)

### Forward Mapping (Editor → Preview)

VS Code uses the markdown-it source map plugin to inject `data-line` and `class="code-line"` on every block-level element. The preview script then:

1. Caches all elements with `class="code-line"`
2. On editor scroll, calls `getElementsForSourceLine(targetLine)` which binary searches the cache
3. Returns the `{previous, next}` surrounding elements
4. Interpolates scroll position between them

### Reverse Mapping (Preview → Editor)

`getEditorLineNumberForPageOffset(pageOffset)`:

1. Binary search through visible `code-line` elements by vertical position
2. Find the two surrounding elements
3. Calculate "progress" ratio between them
4. For code blocks: adjust for padding, count newlines within the block
5. Interpolate the source line number

```typescript
// Simplified from scroll-sync.ts
function getEditorLineNumberForPageOffset(offset: number): number {
  const { previous, next } = getLineElementsAtPageOffset(offset);
  const betweenProgress = (offset - previous.top) / (next.top - previous.top);
  return previous.line + betweenProgress * (next.line - previous.line);
}
```

### Special Handling

- **Code blocks**: Newlines counted within `<pre><code>` to calculate `endLine`, enabling sub-block interpolation
- **Lists**: Parent `<ul>`/`<ol>` skipped to avoid duplicate line numbers (children carry the real lines)
- **HTML blocks**: Wrapped in a `<div>` with `data-line` since html_block renderer ignores token attrs
- **Third-party plugins**: Any markdown-it plugin that doesn't respect `token.attrSet()` will produce elements without source line data

### Applicability
**High**. VS Code's approach is the gold standard for markdown↔HTML bidirectional mapping. The `data-line` injection pattern combined with binary search and interpolation is directly reusable. The key insight is that **block-level granularity is sufficient** for scroll sync but may not be sufficient for annotation anchoring (where users select inline text within a paragraph).

---

## 7. Remark/Unified — AST Position Tracking

**Source**: [remark](https://github.com/remarkjs/remark) | [Discussion #1022](https://github.com/orgs/remarkjs/discussions/1022)

### Position Data in mdast Nodes

Every node in remark's markdown AST (mdast) includes position data with line, column, and byte offset:

```json
{
  "type": "text",
  "value": "Hello world",
  "position": {
    "start": { "line": 1, "column": 3, "offset": 2 },
    "end": { "line": 1, "column": 14, "offset": 13 }
  }
}
```

### Converting to HTML with Position Preservation

When converting mdast → hast (HTML AST) via `remark-rehype`, position data is **stripped by default**. To preserve it:

```javascript
import { visit } from 'unist-util-visit';
import { stringifyPosition } from 'unist-util-stringify-position';

function rehypeAddPositions() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.position) {
        node.properties = node.properties || {};
        node.properties['data-source-start'] = `${node.position.start.line}:${node.position.start.column}`;
        node.properties['data-source-end'] = `${node.position.end.line}:${node.position.end.column}`;
      }
    });
  };
}
```

### Advantage Over markdown-it

Remark provides **both line AND column** positions, and it works at **inline granularity** (text nodes, emphasis, links, etc. all have positions). This is a significant advantage over markdown-it which only provides block-level line ranges.

### Applicability
**Very High**. Remark's inline-level position tracking solves the granularity problem that markdown-it cannot. If you need to know that "bold text" within a paragraph starts at line 5, column 12 — remark can provide this. The tradeoff is that remark's API is more complex (AST transformations via unified pipeline).

---

## 8. position-map-text-to-markdown — Reverse Mapping Library

**Source**: [GitHub](https://github.com/azu/position-map-text-to-markdown)

### Purpose

Maps rendered/plain-text positions back to markdown source positions. Given text visible in the rendered output, finds where it occurs in the markdown source.

### API

```javascript
import { findAllPositions } from "position-map-text-to-markdown";

const results = findAllPositions({
  text: "match",
  markdown: "**match** __match__"
});

// Returns:
// [
//   { markdown: "match", range: [2, 7], loc: { start: { line: 1, column: 2 }, end: { line: 1, column: 7 } } },
//   { markdown: "match", range: [12, 17], loc: { start: { line: 1, column: 12 }, end: { line: 1, column: 17 } } }
// ]
```

### How It Works

1. Strips markdown syntax to produce plain text
2. Tracks character position offsets through the stripping process
3. Maps rendered text positions back to source coordinates using stored offsets

### Limitations
- Exact text matching only (no fuzzy)
- Limited to basic markdown syntax (bold, italic)
- Last updated 2018
- No handling for complex structures (tables, nested lists, code blocks)

### Applicability
**Low-Medium**. Useful as a reference for the reverse-mapping concept, but too limited for production use. The approach of tracking offsets through syntax stripping is sound but needs a more robust implementation.

---

## 9. ProseMirror — Marks, Decorations, and Position Mapping

**Source**: [ProseMirror Guide](https://prosemirror.net/docs/guide/) | [Change Tracking Example](https://prosemirror.net/examples/track/) | [Remirror Annotation Issues](https://www.remirror.io/blog/annotation-issues/)

### Two Approaches to Annotations

**Marks (Document-Embedded)**:
- Annotations stored as part of the document structure
- Positions automatically correct when content changes (insertions, deletions)
- Copy/paste and undo/redo work naturally
- Limited metadata (only mark attributes)

**Decorations (External)**:
- Annotations stored separately with `from`/`to` positions
- Can span across multiple nodes
- Require manual position recalculation on edits
- Rich metadata support

### Position Mapping Through Changes

ProseMirror's killer feature for annotations: every edit produces a `StepMap` that can translate positions from the old document to the new one:

```javascript
// Position mapping through a transform
let tr = new Transform(myDoc);
tr.split(10);       // Insert 2 tokens at position 10
tr.delete(2, 5);    // Delete 3 tokens at position 2

// Map a position through all changes
console.log(tr.mapping.map(15)); // → 14

// Bias controls behavior at insertion points
console.log(tr.mapping.map(10, -1)); // → 7 (stays before insertion)
console.log(tr.mapping.map(10, 1));  // → 12 (moves after insertion)
```

### The Marks vs. Decorations Lesson (Remirror/Collaborne)

Collaborne's experience building a collaborative annotation system:

| Problem | Decorations (External) | Marks (Embedded) |
|---|---|---|
| Position accuracy | Drifts with latency | Always correct |
| Copy/paste | Broken | Works natively |
| Undo/redo | "Really hard" | Automatic |
| Concurrent editing | Race conditions | Conflict-free |
| Metadata storage | Flexible (database) | Limited (attributes) |

**Their solution**: Hybrid — store mark IDs in the document, keep metadata in the database. "Eventual consistency" through continuous comparison.

### Change Tracking

The `prosemirror-changeset` module distills editing steps into inserted/deleted ranges with associated metadata (user, timestamp), usable for blame-map style tracking.

### Applicability
**Medium-High**. ProseMirror's position mapping system is the state of the art for rich text annotation positioning, but it operates on its own document model, not markdown source. The **conceptual patterns** (step-based mapping, bias parameters, marks vs decorations tradeoffs) are highly transferable. If your tool uses a ProseMirror-based editor, you get annotation positioning essentially for free.

---

## 10. Yjs Y.RelativePosition — CRDT-Based Stable Anchors

**Source**: [Yjs Docs](https://docs.yjs.dev/api/relative-positions) | [GitHub](https://github.com/yjs/yjs)

### Core Concept

A `Y.RelativePosition` is attached to a CRDT item (character), not an index. It survives all concurrent edits:

```
Document: "a|c"     (cursor between 'a' and 'c')
Insert 'x' at 1:    "ax|c"    (cursor stays before 'c')
Delete 'a':          "x|c"    (cursor stays before 'c')
```

### API

```javascript
// Create a relative position attached to index 2 in a Y.Text
const relPos = Y.createRelativePositionFromTypeIndex(ytext, 2);

// Later, after arbitrary edits, resolve back to absolute index
const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc);
// → { type: ytext, index: <new-index>, assoc: 0 }

// Serialize for storage
const encoded = Y.encodeRelativePosition(relPos);  // Uint8Array
const decoded = Y.decodeRelativePosition(encoded);
```

### Association Parameter

`assoc` controls which side of an insertion the position tracks:
- `assoc >= 0` (default): associates with the character **after** the index
- `assoc < 0`: associates with the character **before** the index

This is analogous to ProseMirror's mapping bias.

### Annotation Pattern

```javascript
// Store annotation anchors as relative positions
const startRelPos = Y.createRelativePositionFromTypeIndex(ytext, selectionStart);
const endRelPos = Y.createRelativePositionFromTypeIndex(ytext, selectionEnd);

// After any edits, resolve to current absolute positions
const start = Y.createAbsolutePositionFromRelativePosition(startRelPos, ydoc);
const end = Y.createAbsolutePositionFromRelativePosition(endRelPos, ydoc);
```

### Strengths
- **Mathematically guaranteed** to track the right position through any sequence of edits
- Works in collaborative (multi-user) editing scenarios
- No fuzzy matching or heuristics needed — it's exact
- Efficient binary serialization

### Weaknesses
- Requires the document to be a Yjs shared type (`Y.Text`, `Y.Array`, etc.)
- Cannot retroactively anchor to historical positions in non-CRDT documents
- Overkill if you don't need collaborative editing

### Applicability
**High if you adopt Yjs for your markdown editing**. If your markdown document is stored as a `Y.Text`, relative positions give you free, perfect annotation anchoring. If not, this approach is not directly usable, but the concept of "anchor to content identity, not index" is the key takeaway.

---

## 11. Google diff-match-patch — Fuzzy Matching and Patching

**Source**: [GitHub](https://github.com/google/diff-match-patch) | [API Wiki](https://github.com/google/diff-match-patch/wiki/API)

### Three Core Functions

**`match_main(text, pattern, loc)`** — Fuzzy text search near an expected location:
- Uses the **Bitap algorithm** (shift-or) internally
- Scores candidates by both edit distance AND proximity to `loc`
- `Match_Threshold` (default 0.5): 0 = exact only, 1 = very fuzzy
- `Match_Distance` (default 1000): how far from `loc` a match can be

```javascript
const dmp = new diff_match_patch();
dmp.Match_Threshold = 0.4;
dmp.Match_Distance = 500;

// Find "annotation" near position 100, tolerating some errors
const pos = dmp.match_main(documentText, "annotation", 100);
// Returns: best match position, or -1
```

**`patch_make(text1, text2)` / `patch_apply(patches, text)`** — Create and apply patches:

```javascript
const patches = dmp.patch_make("old text here", "new text here");
const [newText, results] = dmp.patch_apply(patches, "old text here slightly modified");
// results: array of booleans indicating which patches applied successfully
```

### Re-Anchoring Strategy

Use `match_main` to relocate annotation text after edits:

```javascript
// Original annotation: "important finding" at position 142
const originalText = "important finding";
const expectedPosition = 142;

// After document edit, find new position
const newPosition = dmp.match_main(editedDocument, originalText, expectedPosition);
```

### Strengths
- Proven at Google scale (powers Google Docs internally)
- Available in 10+ languages
- `match_main` combines fuzzy matching with location bias — perfect for re-anchoring
- Configurable threshold and distance parameters

### Weaknesses
- Operates on plain text only (no structure awareness)
- Pattern length limited by Bitap algorithm's word-size constraints
- No concept of prefix/suffix context (unlike TextQuoteSelector)

### Applicability
**High for re-anchoring**. `match_main` with a position hint is an excellent fallback when exact matching fails. Can be combined with TextQuoteSelector data (use the `exact` field as pattern, original position as `loc`).

---

## 12. Google Docs / Notion — OT/CRDT Comment Systems

### Google Docs

**Approach**: Operational Transformation (OT) with anchored comments.

- Comments are attached to text ranges within a specific document version
- The OT system transforms comment positions alongside text operations
- When text is moved, comments follow the text and re-arrange automatically
- Via API: anchors are stored with comments but are **immutable** — the API anchor field is saved but the editor UI ignores API-created anchors for Workspace files
- Internally, the editor tracks comment positions through the OT operation log

**Key insight**: Google's approach works because they control the entire editing pipeline. Every edit is an OT operation, and comment positions are transformed through the same operation chain.

**Limitation**: No public documentation of the internal anchoring mechanism. The Drive API's anchor system is separate from and inferior to the editor's internal tracking.

### Notion

**Approach**: Block-level CRDT architecture.

- Everything is a "block" — paragraphs, headings, images, etc.
- Comments are attached to blocks (and can be attached to inline text within blocks)
- CRDT (adapted from YATA) handles conflict resolution for concurrent edits
- Block-level identity is stable — blocks have persistent IDs regardless of position
- Inline text comments likely use relative positions within the block's CRDT text

**Key insight**: Block-level identity (stable block IDs) provides a natural coarse anchor. Inline positions within a block use CRDT-relative positions for fine-grained anchoring.

### Applicability
**Conceptual only** — neither system is open source or documented at the implementation level. The pattern of "stable block ID + relative inline position" is the most transferable insight.

---

## 13. Dual-Pane Sync Scrolling Patterns

**Sources**: VS Code, Joplin, StackEdit, various markdown editors

### The Standard Pattern

All dual-pane markdown editors use the same fundamental approach:

1. **During rendering**: Inject `data-source-line` (or `data-index`) attributes on block-level HTML elements
2. **Editor → Preview sync**: 
   - Determine which source line is at the editor's scroll position
   - Find the corresponding HTML element via its `data-source-line` attribute
   - Scroll the preview to that element
3. **Preview → Editor sync**:
   - Find the nearest `data-source-line` element at the preview's scroll position
   - Scroll the editor to that line number
4. **Interpolation**: Between mapped elements, use linear interpolation based on height ratios

### Joplin's Architecture

```
Editor → Preview:  ePercent → E2L() → linePercent → L2V() → vPercent
Preview → Editor:  vPercent → V2L() → linePercent → L2E() → ePercent
```

Where:
- `E2L()`: editor scroll percentage → line number (via CodeMirror)
- `L2V()`: line number → preview scroll position (via cached `source-line` element positions)
- `V2L()`: preview position → line number (via DOM scan of `source-line` elements)
- `L2E()`: line number → editor scroll percentage (via CodeMirror)

### Cache Invalidation

Scroll position caches are invalidated on:
- Note switching
- Content editing
- Window resizing

### Applicability
**Medium for annotation**. Scroll sync establishes the `data-source-line` infrastructure that annotation anchoring can piggyback on. The block-level mapping gives you "which paragraph" — you then need TextQuoteSelector within that paragraph for precise inline anchoring.

---

## 14. Synthesis: Recommended Architecture

Based on all research, here is a recommended layered approach for a markdown annotation tool:

### Layer 1: Forward Mapping (Markdown → HTML with Source Positions)

**Use remark/unified** (preferred) or **markdown-it** with source map plugin.

```
Markdown Source  →  Parse  →  AST with positions  →  Render  →  HTML with data-source-line
```

- Remark: inline-level granularity (line + column for every node)
- markdown-it: block-level only (line range per block element)

Inject `data-source-line` and `data-source-end` attributes on rendered HTML elements.

### Layer 2: Annotation Descriptor (What to Store)

Use a **hybrid W3C-compatible selector** combining fast + robust strategies:

```json
{
  "id": "ann-001",
  "selectors": [
    {
      "type": "MarkdownPositionSelector",
      "startLine": 12,
      "startColumn": 5,
      "endLine": 12,
      "endColumn": 42
    },
    {
      "type": "TextQuoteSelector",
      "exact": "the annotated text",
      "prefix": "context before ",
      "suffix": " context after"
    }
  ],
  "markdownVersion": "abc123"
}
```

- **MarkdownPositionSelector**: Fast primary anchor, brittle to edits
- **TextQuoteSelector**: Robust fallback for re-anchoring after edits
- **markdownVersion**: Hash or git commit to detect when re-anchoring is needed

### Layer 3: Reverse Mapping (HTML Selection → Markdown Position)

When the user selects text in rendered HTML:

1. Walk up from the selection to the nearest element with `data-source-line`
2. Get the block-level source line from the attribute
3. Extract the selected text (`Selection.toString()`)
4. Use `position-map-text-to-markdown` approach or direct AST lookup to find the exact column within the source line
5. Create both MarkdownPositionSelector and TextQuoteSelector

### Layer 4: Re-Anchoring (When Markdown Changes)

Fallback chain:

```
1. MarkdownPositionSelector → exact line/column lookup
   ↓ (fail if lines changed)
2. TextQuoteSelector exact match → indexOf in document
   ↓ (fail if text changed)
3. TextQuoteSelector fuzzy match → approx-string-match or diff-match-patch.match_main
   with position hint from MarkdownPositionSelector
   ↓ (fail if text heavily rewritten)
4. Orphan the annotation (mark as unresolvable, show to user for manual re-anchoring)
```

### Key Libraries to Use

| Library | Purpose | Language |
|---|---|---|
| `remark` / `unified` | Markdown parsing with inline positions | JS/TS |
| `markdown-it` + source-map plugin | Alternative parser with block-level positions | JS |
| `approx-string-match` | Myers' fuzzy string matching for re-anchoring | JS |
| `diff-match-patch` | Fuzzy match with location bias (`match_main`) | Multi-language |
| W3C Web Annotation vocabulary | Interoperable selector data model | JSON-LD |

### Decision Matrix

| If your tool... | Then use... |
|---|---|
| Needs inline-level precision | remark/unified (not markdown-it) |
| Only needs block-level precision | markdown-it + source-map plugin |
| Has a ProseMirror-based editor | ProseMirror marks + position mapping |
| Supports collaborative editing | Yjs Y.RelativePosition |
| Must survive major content rewrites | TextQuoteSelector + fuzzy matching |
| Needs to interoperate with other tools | W3C Web Annotation Data Model |

---

## Sources

- [Hypothesis Client — Anchoring Module](https://github.com/hypothesis/client/tree/main/src/annotator/anchoring)
- [Hypothesis Blog — Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/)
- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- [W3C Web Annotation Vocabulary](https://www.w3.org/TR/annotation-vocab/)
- [Apache Annotator (incubating)](https://github.com/apache/incubator-annotator)
- [markdown-it Token.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/token.mjs)
- [markdown-it-source-map](https://github.com/tylingsoft/markdown-it-source-map)
- [markdown-it-inject-linenumbers](https://github.com/digitalmoksha/markdown-it-inject-linenumbers)
- [VS Code Markdown Features — Source Map PR #134799](https://github.com/microsoft/vscode/pull/134799)
- [VS Code Markdown Features — Issue #133376](https://github.com/microsoft/vscode/issues/133376)
- [remark — Markdown Processor](https://github.com/remarkjs/remark)
- [remark Source Maps Discussion #1022](https://github.com/orgs/remarkjs/discussions/1022)
- [position-map-text-to-markdown](https://github.com/azu/position-map-text-to-markdown)
- [ProseMirror Guide — Transforms](https://prosemirror.net/docs/guide/#transform)
- [ProseMirror Change Tracking Example](https://prosemirror.net/examples/track/)
- [Remirror Annotation Extension](https://www.remirror.io/docs/extensions/annotation-extension/)
- [Remirror Blog — Highlights & Comments](https://www.remirror.io/blog/annotation-issues/)
- [Yjs Y.RelativePosition Docs](https://docs.yjs.dev/api/relative-positions)
- [approx-string-match-js](https://github.com/robertknight/approx-string-match-js)
- [Google diff-match-patch](https://github.com/google/diff-match-patch)
- [diff-match-patch API](https://github.com/google/diff-match-patch/wiki/API)
- [Notion Data Model](https://www.notion.com/blog/data-model-behind-notion)
- [Joplin Sync Scroll Specification](https://joplinapp.org/help/dev/spec/sync_scroll/)
- [Implementing Sync Scrolling in Markdown Editor](https://dev.to/woai3c/implementing-synchronous-scrolling-in-a-dual-pane-markdown-editor-5d75)
