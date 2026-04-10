# Research: Annotation & Review Tool Persistence Strategies

**Date:** 2026-04-06
**Purpose:** Deep analysis of how production annotation tools persist their data, to inform the design of a standalone markdown annotation tool for Atomic Flow.

---

## Table of Contents

1. [Hypothesis (Web Annotation)](#1-hypothesis-web-annotation)
2. [Google Docs Comments](#2-google-docs-comments)
3. [GitHub PR Review Comments](#3-github-pr-review-comments)
4. [PDF Annotation Tools](#4-pdf-annotation-tools)
5. [Microsoft Word Track Changes / Comments](#5-microsoft-word-track-changes--comments)
6. [Markdown Lint Tools](#6-markdown-lint-tools)
7. [Static Analysis Tools](#7-static-analysis-tools)
8. [SARIF Format](#8-sarif-format)
9. [LSP Diagnostics](#9-lsp-diagnostics)
10. [Inline Markdown Comments](#10-inline-markdown-comments)
11. [Git Notes](#11-git-notes)
12. [Code Review Tools (Gerrit, ReviewBoard, Crucible)](#12-code-review-tools)
13. [CriticMarkup](#13-criticmarkup)
14. [W3C Web Annotation Protocol](#14-w3c-web-annotation-protocol)
15. [Sidecar Files in Other Domains](#15-sidecar-files-in-other-domains)
16. [Comparative Analysis](#16-comparative-analysis)
17. [Recommendation for Markdown Annotation Tool](#17-recommendation)

---

## 1. Hypothesis (Web Annotation)

### Where annotations are stored
- **Server-side dual-store:** PostgreSQL (primary source of truth) + Elasticsearch (search/indexing)
- Historical accident: originally Elasticsearch-only (from annotator-store demo app); Postgres added later
- Architecture: web worker inserts annotation into Postgres + inserts index job into job queue (RabbitMQ) for Elasticsearch sync
- Also uses Redis for caching
- Annotations live **separately from documents** and are reunited via anchoring at render time

### Format
- JSON conforming to W3C Web Annotation Data Model (JSON-LD)
- Uses TextQuoteSelector for anchoring:
```json
{
  "target": [{
    "source": "https://example.com/page",
    "selector": [
      {
        "type": "TextQuoteSelector",
        "exact": "the annotated text",
        "prefix": "text before ",
        "suffix": " text after"
      },
      {
        "type": "TextPositionSelector",
        "start": 412,
        "end": 795
      }
    ]
  }]
}
```

### How it handles document changes
- **Fuzzy anchoring**: When re-anchoring, the system finds the prefix and suffix in the document, then compares the text between them to the `exact` field. If the difference is within an acceptance threshold, the match succeeds.
- TextQuoteSelector is the primary mechanism; TextPositionSelector is secondary/fallback
- This is the gold standard for re-anchoring in changed documents

### Pros for standalone CLI
- W3C standard format ensures interoperability
- Fuzzy anchoring handles document drift elegantly
- Rich selector model (quote, position, fragment, CSS, XPath)

### Cons for standalone CLI
- Requires server infrastructure (Postgres + Elasticsearch + RabbitMQ + Redis)
- Not designed for offline/local use
- Overkill for a CLI tool

### Survives file sharing?
- No -- annotations are on the server, not in the file. Sharing the file does not share annotations.

---

## 2. Google Docs Comments

### Where annotations are stored
- **Server-side database** (Google's proprietary infrastructure)
- Comments are managed through the Google Drive API (not the Docs API)
- Accessible via `comments` resource on the Drive API

### Format
```json
{
  "id": "comment-id",
  "kind": "drive#comment",
  "createdTime": "2026-04-06T12:00:00Z",
  "modifiedTime": "2026-04-06T12:30:00Z",
  "resolved": false,
  "anchor": "<JSON string>",
  "author": { "displayName": "Henry", "emailAddress": "..." },
  "content": "This needs clarification",
  "htmlContent": "<p>This needs clarification</p>",
  "quotedFileContent": { "mimeType": "text/plain", "value": "original text" },
  "replies": [{ "content": "Fixed!", "author": {...} }]
}
```

### How it handles document changes
- **Anchors are immutable** -- their position relative to content cannot be guaranteed between revisions
- Google recommends anchors only for static documents (images, read-only docs)
- Anchor field is "a region of the document represented as a JSON string" with `revisionID` (r) and region (a)
- Operational Transform (OT) engine handles real-time repositioning during collaborative editing

### Export behavior
- DOCX export: comments preserved (visible in Word)
- PDF export: comments NOT embedded as annotations; may include summary
- Google Takeout: exports comments as separate JSON/CSV files
- RTF, TXT, EPUB, ODT: comments lost

### Survives file sharing?
- Only within Google ecosystem. Export loses comments in most formats.

---

## 3. GitHub PR Review Comments

### Where annotations are stored
- **Server-side database** (GitHub's infrastructure)
- Accessible via REST API and GraphQL API

### Format
Review comments reference code by diff position:
```json
{
  "id": 12345,
  "pull_request_review_id": 67890,
  "diff_hunk": "@@ -16,33 +16,40 @@ public class Foo {",
  "path": "src/main/java/Foo.java",
  "position": 5,
  "original_position": 5,
  "commit_id": "abc123",
  "original_commit_id": "def456",
  "body": "nit: rename this variable",
  "line": 20,
  "side": "RIGHT",
  "start_line": 18,
  "start_side": "RIGHT",
  "created_at": "2026-04-06T12:00:00Z",
  "user": { "login": "reviewer" }
}
```

### How it handles document changes
- Comments are anchored to **diff positions** (line number within a hunk), not absolute file positions
- `position` = lines down from first `@@` hunk header
- When code changes across force-pushes, comments can become "outdated" (position no longer valid)
- GitHub shows outdated comments in a collapsed section
- No automatic re-anchoring; stale comments remain at their original position

### Pros for standalone CLI
- Simple positional model (file + line number)
- Rich threading (replies to comments)

### Cons for standalone CLI
- Tied to diff context, not absolute document positions
- Requires server
- Comments don't travel with the code

### Survives file sharing?
- No. Comments exist only on GitHub's servers.

---

## 4. PDF Annotation Tools (Adobe Acrobat, PDF.js, Foxit)

### Where annotations are stored
Two approaches:

**A. Embedded in PDF (inline)**
- Annotations are part of the PDF file's internal structure
- Stored as annotation dictionaries in the PDF cross-reference table
- Travel with the file automatically

**B. Sidecar files (FDF / XFDF)**
- **FDF (Forms Data Format):** Binary-ish key/value format; subset of PDF spec
- **XFDF (XML Forms Data Format):** XML version of FDF

### XFDF format example
```xml
<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <annots>
    <text page="0" rect="100,200,150,250"
          color="#FFFF00" date="D:20260406"
          name="comment-1" subject="Note"
          title="Henry">
      <contents-richtext>
        <body>This section needs review</body>
      </contents-richtext>
    </text>
    <highlight page="0" rect="72,500,400,520"
               color="#FFFF00" opacity="0.5">
      <popup page="0" rect="400,500,550,600"/>
    </highlight>
  </annots>
</xfdf>
```

### Key differences
| Feature | FDF | XFDF |
|---------|-----|------|
| Format | Key/value (PDF-like) | XML |
| Readability | Low | High |
| Subset of PDF | Yes | Yes (smaller subset) |
| JavaScript support | Yes | No |
| Embedded FDFs | Yes | No |

### How it handles document changes
- Annotations are anchored by **page number + rectangle coordinates**
- If document content reflows, annotations can become misaligned
- No automatic re-anchoring
- XFDF references the source PDF by filename/path

### Pros for standalone CLI
- XFDF is human-readable XML sidecar
- Industry standard (Adobe-defined)
- Can be kept alongside source file in version control

### Cons for standalone CLI
- Designed for page-based layout, not line-based text
- Rectangle-based anchoring doesn't map to markdown
- XFDF is XML (verbose for simple annotations)

### Survives file sharing?
- Embedded: Yes (in PDF itself)
- XFDF sidecar: Only if both files are shared together

---

## 5. Microsoft Word Track Changes / Comments

### Where annotations are stored
**Inside the .docx ZIP archive**, but in a **separate XML file**:
```
document.docx (ZIP)
  ├── [Content_Types].xml
  ├── _rels/
  ├── word/
  │   ├── document.xml          ← main content
  │   ├── comments.xml          ← comment bodies
  │   ├── comments.xml.rels     ← hyperlinks in comments
  │   ├── styles.xml
  │   └── ...
  └── ...
```

### Format
**comments.xml** contains comment bodies:
```xml
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="Henry" w:initials="HA" w:date="2026-04-06T12:00:00Z">
    <w:p>
      <w:r>
        <w:t>This section needs revision</w:t>
      </w:r>
    </w:p>
  </w:comment>
</w:comments>
```

**document.xml** contains anchoring markers:
```xml
<w:p>
  <w:commentRangeStart w:id="1"/>
  <w:r><w:t>The annotated text</w:t></w:r>
  <w:commentRangeEnd w:id="1"/>
  <w:r><w:commentReference w:id="1"/></w:r>
</w:p>
```

### Anchoring mechanism
- **Split storage:** Comment content in `comments.xml`, anchoring in `document.xml`
- `commentRangeStart` and `commentRangeEnd` elements wrap the annotated text in document.xml
- `commentReference` element links to the comment by ID
- All three elements share the same `w:id` attribute

### How it handles document changes
- Anchoring markers are embedded in the document flow (structural)
- If text between range markers is edited, the comment stays attached
- If the range markers themselves are deleted, the comment becomes orphaned
- Track Changes records every edit as `<w:ins>` (insertion) and `<w:del>` (deletion) elements

### Pros for standalone CLI
- Elegant separation: content separate from anchoring markers
- Industry-proven at scale
- Self-contained within the file package

### Cons for standalone CLI
- XML is verbose
- Requires ZIP packaging
- Not applicable to plain-text markdown

### Survives file sharing?
- Yes -- comments are inside the .docx archive. They travel with the file.

---

## 6. Markdown Lint Tools (markdownlint, remark-lint)

### Output formats

**markdownlint** supports three output formats:

**Plain text (default):**
```
README.md:3: MD022/blanks-around-headings Headings should be surrounded by blank lines [Expected: 1; Actual: 0; Below]
README.md:15: MD009/no-trailing-spaces Trailing spaces [Expected: 0 or 2; Actual: 1]
```

**JSON:**
```json
[
  {
    "fileName": "README.md",
    "lineNumber": 3,
    "ruleNames": ["MD022", "blanks-around-headings"],
    "ruleDescription": "Headings should be surrounded by blank lines",
    "ruleInformation": "https://...",
    "errorDetail": "Expected: 1; Actual: 0; Below",
    "errorContext": null,
    "errorRange": null
  }
]
```

**SARIF:** Standard SARIF JSON format (see section 8).

**remark-lint** outputs via configurable reporters:
```
README.md:3:1 warning Heading content indentation heading-content-indent remark-lint
```

### How IDEs consume findings
- VS Code extension (vscode-markdownlint) runs markdownlint as a language server
- Findings are converted to **LSP Diagnostics** (see section 9)
- Appear as squiggly underlines in the editor
- Rule violations shown in the Problems panel

### Relevance to annotation tool
- The `file:line:column message` format is **universally understood** by editors
- All lint tools converge on this format because editors parse it
- SARIF provides the richest structured alternative

---

## 7. Static Analysis Tools (ESLint, SonarQube, CodeClimate)

### ESLint output formats
Built-in formatters include:
- **stylish** (default): Human-readable terminal output
- **json**: Full structured output
- **json-with-metadata**: JSON + rule metadata
- **compact**: One line per error
- **unix**: `file:line:col: message` format
- **html**: Browser-viewable report

### SonarQube
- Imports ESLint JSON reports directly
- Has its own internal database for persisting issues
- Issues have status lifecycle: Open -> Confirmed -> Resolved -> Closed
- SonarLint IDE extension syncs rules + issue statuses

### CodeClimate / GitLab Code Quality
```json
[
  {
    "description": "Method `foo` has a Cognitive Complexity of 15 (exceeds 5 allowed).",
    "check_name": "method_complexity",
    "fingerprint": "abc123def456",
    "severity": "major",
    "location": {
      "path": "src/foo.js",
      "lines": {
        "begin": 10,
        "end": 45
      }
    }
  }
]
```

Key design: **fingerprint** field (MD5 hash) provides stable identity across runs even if line numbers shift.

### Relevance to annotation tool
- **Fingerprint-based identity** is a powerful concept: annotation identity independent of position
- CodeClimate severity levels: `info`, `minor`, `major`, `critical`, `blocker`
- All tools converge on: file + line range + severity + message + rule/category

---

## 8. SARIF (Static Analysis Results Interchange Format)

### What it is
- OASIS standard (v2.1.0)
- JSON-based format for static analysis output
- Designed to aggregate results from multiple tools

### Structure
```json
{
  "version": "2.1.0",
  "$schema": "https://json.schemastore.org/sarif-2.1.0-rtm.4",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "AnnotationTool",
          "version": "1.0.0",
          "rules": [
            {
              "id": "REVIEW-001",
              "shortDescription": { "text": "Question about implementation" },
              "helpUri": "https://..."
            }
          ]
        }
      },
      "results": [
        {
          "ruleId": "REVIEW-001",
          "level": "warning",
          "message": { "text": "What inputs does this accept?" },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "docs/spec.md",
                  "uriBaseId": "%SRCROOT%"
                },
                "region": {
                  "startLine": 42,
                  "startColumn": 1,
                  "endLine": 45,
                  "endColumn": 80,
                  "snippet": { "text": "The function accepts parameters..." }
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### Who uses it
- GitHub Code Scanning (native SARIF upload)
- ESLint, markdownlint (SARIF formatter)
- Microsoft tools (MSVC, BinSkim, Credential Scanner)
- SonarQube (import support)
- VS Code SARIF Viewer extension

### Suitability for human annotations
- **Designed for tool output, not human authoring** -- too verbose
- But the data model maps well: location + message + severity + rule
- Could be used as an **export format** even if not the storage format
- `region.snippet.text` can capture the annotated text (like TextQuoteSelector)

### Pros
- Industry standard, tooling ecosystem exists
- GitHub native support
- Rich location model (physical + logical locations)
- Extensible via properties bag

### Cons
- Very verbose for simple annotations
- Not designed for human readability/authoring
- No built-in re-anchoring mechanism (just line numbers)

---

## 9. LSP Diagnostics

### Format
```typescript
interface Diagnostic {
  range: Range;           // { start: {line, character}, end: {line, character} }
  severity?: 1|2|3|4;    // Error, Warning, Information, Hint
  code?: string|number;
  codeDescription?: { href: URI };
  source?: string;        // e.g., "markdownlint", "eslint"
  message: string;
  tags?: DiagnosticTag[]; // Unnecessary=1, Deprecated=2
  relatedInformation?: DiagnosticRelatedInformation[];
  data?: any;
}
```

### How it works
- Server publishes diagnostics via `textDocument/publishDiagnostics` notification
- Client (editor) renders them as squiggly underlines, gutter icons, etc.
- Diagnostics are **ephemeral** -- not persisted, regenerated on each analysis run
- Range-based anchoring (start line/char to end line/char)

### Could annotations be modeled as diagnostics?
- **Yes, partially.** The data model fits: range + severity + message + source
- Limitation: diagnostics are transient, pushed from server to client
- Would need a custom language server that reads annotation files and publishes them as diagnostics
- Already done in practice: markdownlint VS Code extension does exactly this

### Pros
- Every editor already renders diagnostics
- Zero UI work needed if annotations map to diagnostics
- Severity + code + relatedInformation model is rich enough

### Cons
- Ephemeral -- not a persistence format itself
- Requires a language server implementation
- No threading/replies concept

---

## 10. Inline Markdown Comments

### Approach
Embed annotations directly in the markdown file as HTML comments:
```markdown
## Feature Requirements

<!-- @review author:henry date:2026-04-06 type:question -->
<!-- What inputs does this function accept? -->
The function processes user data and returns results.
<!-- /@review -->

<!-- @annotation id:ann-1 severity:warning -->
This section needs more detail about error handling.
<!-- /@annotation -->
```

### How tools handle this
- HTML comments (`<!-- ... -->`) are the de facto standard for "invisible" content in markdown
- **Not rendered** by any markdown processor (GitHub, VS Code preview, etc.)
- Preserved through all transformations (pandoc, remark, etc.)
- `markdown-it-inline-comments` npm package: parses inline comments
- Material for MkDocs: supports annotation markers that expand on click
- Jekyll/Hugo: HTML comments preserved in source but stripped in output

### Advantages
- **Zero infrastructure** -- annotations live in the file
- Survives git push, clone, email, copy
- Parseable with simple regex
- Human-readable in any text editor
- Diffable in git (changes show in `git diff`)
- No sidecar files to lose

### Disadvantages
- **Pollutes the source document** -- annotations are visible when editing
- Hard to distinguish annotations from legitimate HTML comments
- No standard schema -- each tool invents its own format
- Harder to aggregate annotations across multiple files
- Can break markdown rendering if not careful with placement
- Line count changes affect other tools' line references

---

## 11. Git Notes

### How it works
- Notes are stored as blobs in Git's object database
- Referenced by a tree under `refs/notes/commits` (default namespace)
- Each note's filename is the SHA-1 of the annotated git object
- Can attach notes to **any** git object: commits, trees, blobs, or tags

### Internal structure
```
refs/notes/commits → commit → tree
    ├── 145ef0a7a4e0a379b7d8... (blob: note content for commit 145ef0a...)
    ├── d99cd6837d46bc424bc... (blob: note content for commit d99cd68...)
    └── ...
```

The blob content can be **any format** -- plain text, JSON, YAML, whatever.

### Namespacing
- Multiple namespaces: `refs/notes/commits`, `refs/notes/reviews`, `refs/notes/annotations`
- Configure via `GIT_NOTES_REF` env var or `--ref` flag
- Each namespace is a separate ref with its own commit history

### Critical limitations
- **NOT pushed/fetched by default.** Requires explicit configuration:
  ```bash
  # Push notes
  git push origin "refs/notes/*"
  # Fetch notes
  git fetch origin "refs/notes/*:refs/notes/*"
  ```
- `git clone` does NOT clone notes (unless `--mirror`)
- Notes on non-commit objects don't appear in `git log`
- Most Git hosting UIs (GitHub, GitLab) don't display notes
- Notes may not migrate between hosting platforms
- Limited IDE support
- No concept of line-level anchoring (notes attach to whole objects)

### Relevance to annotation tool
- Could annotate specific commits or even specific blobs (file versions)
- But **cannot annotate specific lines** within a file
- Transfer problems make this unreliable for team workflows

---

## 12. Code Review Tools (Gerrit, ReviewBoard, Crucible)

### Gerrit -- NoteDb (Git-native storage)

Since Gerrit 3.0+, **all review metadata is stored in Git** using NoteDb:

```
refs/changes/45/12345/meta → commit history of change metadata
```

Comment format (JSON blob keyed by patchset commit SHA):
```json
{
  "key": {
    "uuid": "c7be1334_47885e36",
    "filename": "java/com/google/gerrit/server/restapi/project/CommitsCollection.java",
    "patchSetId": 7
  },
  "lineNbr": 158,
  "author": {"id": 1026112},
  "writtenOn": "2019-11-06T09:00:50Z",
  "side": 1,
  "message": "nit: factor this out in a variable, use toImmutableList as collector",
  "range": {
    "startLine": 156,
    "startChar": 32,
    "endLine": 158,
    "endChar": 66
  },
  "revId": "071c601d6ee1a2a9f520415fd9efef8e00f9cf60",
  "serverId": "173816e5-2b9a-37c3-8a2e-48639d4f1153",
  "unresolved": true
}
```

**Key insight:** Gerrit stores code reviews **in Git itself** (as notes/refs), meaning reviews travel with the repository. This is the only major code review tool that achieves this.

### ReviewBoard
- **Server-side database** (Django + PostgreSQL/MySQL)
- Comments stored with: `first_line`, `num_lines`, `text`, `issue_opened`, `issue_status`
- Diff comments reference: file in diff + line range
- Storage reduced by 80% via diff compression optimization

### Crucible (Atlassian)
- **Server-side database** (proprietary, Java-based)
- Tight integration with Jira/Confluence
- Supports "cut-and-paste reviews" for informal annotations

---

## 13. CriticMarkup

### What it is
A plain-text syntax for editorial annotations, designed to be compatible with markdown.

### The five markup types

| Type | Syntax | Example |
|------|--------|---------|
| Addition | `{++text++}` | `This {++is ++}a test.` |
| Deletion | `{--text--}` | `This is {--is --}a test.` |
| Substitution | `{~~old~>new~~}` | `This {~~isn't~>is~~} a test.` |
| Highlight | `{==text==}` | `This is a {==test==}.` |
| Comment | `{>>comment<<}` | `Test{>>What is it a test of?<<}.` |

### Combined (highlight + comment):
```markdown
{==This needs work==}{>>The logic here is unclear. Can you add an example?<<}
```

### Design principles
- Must be human-readable in a plain text editor
- Compatible with existing Markdown/MultiMarkdown/HTML
- Processed BEFORE any other markdown parsing (separate layer)

### Limitations
- Must be contained within a single block (cannot span multiple paragraphs)
- Limited tool support (MultiMarkdown, Obsidian plugin, PyMdown Extensions, quarto filter)
- No metadata (author, date, severity, resolution status)
- No threading/replies
- No unique IDs for referencing specific annotations

### Pros for standalone CLI
- **Inline, human-readable, zero-infrastructure**
- Works in any text editor
- Survives git, email, copy
- Git-diffable
- Markdown-native feel

### Cons for standalone CLI
- Pollutes the source document
- No structured metadata
- Cannot express complex annotations (questions, todos, severities)
- Limited cross-block support
- Small ecosystem

---

## 14. W3C Web Annotation Protocol

### Does it define storage?
- **Yes, but abstractly.** It defines a REST API for annotation containers, not a specific backend.
- Built on Linked Data Platform (LDP) specification
- Annotation Containers = LDP Basic Containers

### API operations
| Operation | Method | Endpoint |
|-----------|--------|----------|
| List annotations | GET | `/annotations/` (container) |
| Create annotation | POST | `/annotations/` |
| Read annotation | GET | `/annotations/{id}` |
| Update annotation | PUT | `/annotations/{id}` |
| Delete annotation | DELETE | `/annotations/{id}` |

### Data model (JSON-LD)
```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "http://example.org/anno1",
  "type": "Annotation",
  "created": "2026-04-06T12:00:00Z",
  "creator": { "type": "Person", "name": "Henry" },
  "body": {
    "type": "TextualBody",
    "value": "What inputs does this accept?",
    "format": "text/plain"
  },
  "target": {
    "source": "http://example.org/spec.md",
    "selector": {
      "type": "TextQuoteSelector",
      "exact": "The function processes user data",
      "prefix": "## Requirements\n\n",
      "suffix": " and returns results."
    }
  }
}
```

### Selector types defined by the standard
| Selector | Anchoring method | Resilience to changes |
|----------|-----------------|----------------------|
| TextQuoteSelector | exact text + prefix/suffix context | **High** (fuzzy matching) |
| TextPositionSelector | start/end character offsets | **Low** (breaks on any edit) |
| FragmentSelector | RFC-defined fragments (e.g., `#line=5,10`) | Medium |
| CssSelector | CSS selector path | Medium |
| XPathSelector | XPath expression | Medium |
| DataPositionSelector | byte offsets | **Very low** |
| SvgSelector | SVG shape overlay | N/A for text |
| RangeSelector | start + end selectors | Depends on sub-selectors |

### Infrastructure requirements
- HTTPS recommended
- JSON-LD serialization required
- ETag-based concurrency control
- Content negotiation
- **No specific database/filesystem mandated**

---

## 15. Sidecar Files in Other Domains

### A. SRT / VTT (Video Subtitles)

**SRT format:**
```
1
00:00:05,000 --> 00:00:10,000
This is the first subtitle.

2
00:00:12,000 --> 00:00:17,500
This is the second subtitle.
```

**VTT format (WebVTT):**
```
WEBVTT

00:00:05.000 --> 00:00:10.000
This is the first subtitle.

00:00:12.000 --> 00:00:17.500
This is the second subtitle.
- With <b>styling</b> support
```

**Key properties:**
- Pure sidecar files (never embedded in video)
- Time-anchored (timestamps, not positions)
- Plain text, human-readable/editable
- Same base filename as video (`video.mp4` + `video.srt`)
- Multiple sidecars per video (one per language)
- VTT adds metadata and styling; SRT is minimal

**Relevance:** The naming convention (same basename, different extension) is a proven sidecar pattern. Time-based anchoring is analogous to line-based anchoring.

### B. EXIF / XMP (Image Metadata)

**Two approaches coexist:**

| Approach | EXIF (embedded) | XMP Sidecar |
|----------|-----------------|-------------|
| Location | Inside image file (JPEG/TIFF/DNG header) | Separate `.xmp` file alongside image |
| Format | Binary tag/value | XML (RDF-based) |
| Readability | Requires tooling | Human-readable XML |
| File types | JPEG, TIFF, DNG, PNG (limited) | Any (RAW files especially) |
| Modification | Modifies original file | Non-destructive |

**XMP sidecar example:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:description>Review annotation: needs more contrast</dc:description>
      <dc:subject>
        <rdf:Bag>
          <rdf:li>review</rdf:li>
          <rdf:li>needs-work</rdf:li>
        </rdf:Bag>
      </dc:subject>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
```

**Key lesson:** The photography world solved this exact problem. RAW files cannot be modified, so XMP sidecars hold all edits/metadata. The pairing is by filename convention (`IMG_001.CR2` + `IMG_001.xmp`). The risk is **separation** -- if sidecar is not copied with the file, metadata is lost.

### C. XFDF for PDF (Sidecar Annotations)

Already covered in section 4. Key point: XFDF is the PDF world's sidecar annotation format, separate from the PDF file, referenced by filename.

---

## 16. Comparative Analysis

### Storage Location Taxonomy

| Approach | Location | Example |
|----------|----------|---------|
| **Inline in document** | Embedded in source file | CriticMarkup, HTML comments, Word comments.xml |
| **Sidecar file** | Separate file alongside source | XFDF, XMP, SRT/VTT |
| **Package internal** | Inside file archive | Word .docx (comments.xml), PDF embedded annotations |
| **Git-native** | In git object database | Git notes, Gerrit NoteDb |
| **Server database** | Remote server | Hypothesis, GitHub, Google Docs, ReviewBoard |

### Format Taxonomy

| Format | Used by | Readability | Tooling |
|--------|---------|-------------|---------|
| JSON | SARIF, CodeClimate, W3C Annotation, ESLint | Medium | Universal |
| XML | XFDF, XMP, Word OOXML, SARIF (via JSON) | Medium | Universal |
| Plain text | SRT, CriticMarkup, markdownlint output | **High** | Minimal needed |
| JSON-LD | W3C Web Annotation, Hypothesis | Low | Specialized |
| Binary | EXIF, FDF | None | Requires tooling |
| Custom markup | CriticMarkup | **High** | Minimal |

### Re-anchoring Capability

| Strategy | Mechanism | Resilience | Used by |
|----------|-----------|------------|---------|
| **Text quote + context** | exact + prefix + suffix, fuzzy match | **Highest** | Hypothesis, W3C Annotation |
| **Structural markers** | Elements in document flow | High | Word (commentRangeStart/End) |
| **Content fingerprint** | Hash of annotated content | High | CodeClimate fingerprint |
| **Line numbers** | Absolute line:column | **Low** | SARIF, LSP, lint tools |
| **Diff position** | Position in diff hunk | Low | GitHub PR comments |
| **Page + rectangle** | Coordinates on rendered page | Very low | PDF annotations |
| **Character offset** | Start/end byte/char positions | Very low | TextPositionSelector |

### Git Compatibility

| Approach | Survives push? | Survives clone? | Diffable? |
|----------|---------------|-----------------|-----------|
| Inline HTML comments | Yes | Yes | Yes |
| CriticMarkup | Yes | Yes | Yes |
| Sidecar JSON/YAML | Yes (if committed) | Yes (if committed) | Yes |
| Git notes | Only with explicit refspec | Only with `--mirror` | Limited |
| Server-side | N/A | N/A | N/A |

---

## 17. Recommendation for Markdown Annotation Tool

### Requirements Recap
1. Must work offline
2. Must survive `git push` and `git clone`
3. Must be readable without special libraries
4. Must handle document changes gracefully
5. Must not pollute the source document (optional inline)
6. Must be git-diffable

### Recommended Approach: **Sidecar YAML with TextQuoteSelector anchoring**

#### Primary format: `.annotations.yaml` sidecar file

For a file `docs/spec.md`, annotations live in `docs/spec.annotations.yaml`:

```yaml
# Annotations for spec.md
# Generated by atomic-flow annotation tool
version: 1
source: spec.md
source_hash: sha256:abc123...  # for staleness detection

annotations:
  - id: ann-001
    type: question
    severity: warning
    author: henry
    created: 2026-04-06T12:00:00Z
    resolved: false
    anchor:
      line: 42                           # fast lookup (fragile)
      quote: "The function processes user data"  # fuzzy re-anchor (resilient)
      prefix: "## Requirements\n\n"      # disambiguation context
      suffix: " and returns results."    # disambiguation context
    body: "What inputs does this accept? Need to enumerate."
    replies:
      - author: ai
        created: 2026-04-06T12:05:00Z
        body: "Based on the codebase, it accepts: userId (string), options (object)"

  - id: ann-002
    type: suggestion
    severity: info
    author: henry
    created: 2026-04-06T12:10:00Z
    resolved: true
    resolved_by: henry
    resolved_at: 2026-04-06T13:00:00Z
    anchor:
      line: 67
      quote: "Error handling is done via exceptions"
      prefix: "### Error Handling\n\n"
      suffix: ".\n\nThe following"
    body: "Consider using Result types instead of exceptions"
```

#### Why this approach

**Why YAML over JSON:**
- More human-readable and human-editable
- Supports comments (JSON doesn't)
- Better git diffs (less structural noise)
- Natural for CLI tool users

**Why sidecar over inline:**
- Does not pollute source document
- Can be .gitignored if annotations are private
- Can be committed if annotations should be shared
- Separate concern = separate file

**Why TextQuoteSelector-style anchoring:**
- Proven by Hypothesis at massive scale
- `quote` field enables fuzzy re-anchoring when lines shift
- `prefix`/`suffix` disambiguate multiple matches
- `line` field provides fast O(1) lookup when document hasn't changed
- Falls back to fuzzy matching when line numbers are stale

**Why YAML over SARIF:**
- SARIF is 10x more verbose for the same information
- SARIF is designed for tool output, not human authoring
- SARIF can be an **export format** (convert annotations to SARIF for GitHub/VS Code consumption)

#### Secondary features

**Optional inline mode (CriticMarkup-inspired):**
```markdown
<!-- @ann:ann-001 type:question severity:warning -->
The function processes user data
<!-- /@ann -->
```
Users who prefer inline annotations can opt in. The tool maintains bidirectional sync between inline and sidecar representations.

**SARIF export:**
For integration with VS Code, GitHub Code Scanning, etc.:
```bash
atomic-flow annotations export --format sarif > annotations.sarif
```

**LSP integration:**
A lightweight language server reads `.annotations.yaml` and publishes annotations as LSP diagnostics, making them appear in VS Code/Neovim/etc. without any custom UI.

#### Re-anchoring algorithm

When the source document changes:

1. **Fast path:** Check if line number still matches the quote. If yes, done.
2. **Fuzzy match:** Search document for `prefix` + `quote` + `suffix` with fuzzy matching (Levenshtein distance threshold).
3. **Quote-only search:** If prefix/suffix fail, search for `quote` alone. Accept if unique match.
4. **Stale marker:** If all fail, mark annotation as `anchoring: stale` and preserve original line number. User resolves manually.

#### File naming conventions (inspired by SRT/XMP patterns)

| Source file | Annotation file |
|-------------|----------------|
| `spec.md` | `spec.annotations.yaml` |
| `README.md` | `README.annotations.yaml` |
| `docs/design.md` | `docs/design.annotations.yaml` |

Alternative: single directory approach for cleaner repos:
```
.annotations/
  docs/
    spec.md.yaml
    design.md.yaml
  README.md.yaml
```

#### Comparison of final candidates

| Criterion | Sidecar YAML | Inline HTML Comments | CriticMarkup | Git Notes | Sidecar JSON |
|-----------|-------------|---------------------|--------------|-----------|-------------|
| Offline | Yes | Yes | Yes | Yes | Yes |
| Survives git | Yes | Yes | Yes | No* | Yes |
| Human-readable | **Best** | Good | Good | Good | Good |
| No doc pollution | **Yes** | No | No | Yes | **Yes** |
| Re-anchoring | **Quote-based** | Structural | Structural | N/A | Quote-based |
| Git-diffable | **Yes** | Yes | Yes | Limited | Yes |
| Comments in format | **Yes** | N/A | N/A | N/A | No |
| Metadata (author, date) | **Yes** | Manual | No | Manual | **Yes** |
| Threading/replies | **Yes** | Awkward | No | No | **Yes** |
| Editor integration | Via LSP | Native | Limited | None | Via LSP |
| Tool ecosystem | New | Existing | Small | Git-native | SARIF/etc |

\* Git notes require explicit push/fetch configuration and may not transfer between hosting platforms.

### Final verdict

**Sidecar YAML with TextQuoteSelector anchoring** is the optimal approach because it:

1. Satisfies all hard requirements (offline, git-compatible, readable, non-polluting)
2. Uses proven anchoring from the W3C Web Annotation ecosystem
3. Provides the best human readability and editability
4. Enables rich metadata (threading, resolution, severity) without complexity
5. Can export to SARIF/JSON for tool integration
6. Can serve as the backing store for an LSP server
7. Follows established patterns (XMP sidecars, SRT subtitles, XFDF for PDF)

---

## Sources

- [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- [W3C Web Annotation Protocol](https://www.w3.org/TR/annotation-protocol/)
- [Hypothesis: Annotation is Now a Web Standard](https://web.hypothes.is/blog/annotation-is-now-a-web-standard/)
- [Hypothesis: Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/)
- [Hypothesis ADR-001: PostgreSQL Persistence](https://h.readthedocs.io/en/latest/arch/adr-001/)
- [Google Drive API: Comments Resource](https://developers.google.com/drive/api/reference/rest/v3/comments)
- [Google Drive API: Manage Comments and Replies](https://developers.google.com/workspace/drive/api/guides/manage-comments)
- [GitHub REST API: Pull Request Review Comments](https://docs.github.com/en/rest/pulls/comments)
- [Apryse: XFDF Annotation Format](https://docs.apryse.com/web/guides/xfdf)
- [Appligent: Guide to FDF and XFDF](https://appligent.com/docs-fdf-and-xfdf)
- [Nutrient: PDF Annotation Data Formats](https://www.nutrient.io/guides/ios/annotations/introduction-to-annotations/data-formats/)
- [Microsoft: Insert Comment in Word Document (Open XML)](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-insert-a-comment-into-a-word-processing-document)
- [Microsoft: Structure of a WordprocessingML Document](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document)
- [SARIF Specification v2.1.0 (OASIS)](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
- [SARIF Tutorials (Microsoft)](https://github.com/microsoft/sarif-tutorials)
- [LSP Specification 3.17](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- [markdownlint Output Formats](https://deepwiki.com/markdownlint/markdownlint/5.3-output-formats)
- [ESLint Formatters Reference](https://eslint.org/docs/latest/use/formatters/)
- [GitLab Code Quality (CodeClimate Format)](https://docs.gitlab.com/ci/testing/code_quality/)
- [Gerrit NoteDb Backend](https://gerrit-review.googlesource.com/Documentation/note-db.html)
- [CriticMarkup Syntax](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html)
- [CriticMarkup Toolkit](https://github.com/CriticMarkup/CriticMarkup-toolkit)
- [Git Notes Documentation](https://git-scm.com/docs/git-notes)
- [Storing Data in Git Objects with Notes (Ken Muse)](https://www.kenmuse.com/blog/storing-data-in-git-objects-with-notes/)
- [W3C WebVTT Specification](https://www.w3.org/TR/webvtt1/)
- [ExifTool: Metadata Sidecar Files](https://exiftool.org/metafiles.html)
- [XMP Sidecar vs Embedded Metadata](https://tagmyphotos.com/guides/xmp-sidecar-vs-embedded-metadata)
