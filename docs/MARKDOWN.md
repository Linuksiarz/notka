# The Notka Markdown file

The export writes notes in this format and the import reads it. One note is one `.md` file; several
notes travel as a `.zip` of them. Inside the database a note is still a structured block document
(`DATA-MODEL.md`) — this file is the exchange format, not the storage format, and the conversion
between the two is exact: exporting a note and importing the file gives back the same note
(`frontend/src/entity/noteFile.test.ts`).

## Layout

```markdown
# Groceries #home #[[weekly shop]]

- [ ] Milk
    - [x] **Full fat**

<!-- notka: {"kind":"LIST","color":"yellow","background":null,"pinned":true,"archived":false,"reminderAt":"2026-10-20T08:00:00+02:00","reminderRepeat":"weekly","created":"2026-10-13T22:42:11+02:00","updated":"2026-10-13T22:42:11+02:00"} -->
```

| Part | Rule |
| --- | --- |
| **Title line** | The first line, `# ` and the title. Absent when the note has no title and no labels. A `#` inside the title is written `\#`. |
| **Tags** | The labels, after the title, the way Logseq writes them: `#word`, or `#[[several words]]` for a name with a space. A file carries the **exporter's** labels — labels are personal — and an import gives them to the **importer**, creating the ones that do not exist yet. |
| **Body** | Markdown, one line per block. Headings are one level down (`##` is the note's first level), because the title owns `#`. |
| **Metadata** | One HTML comment at the very end, invisible to any Markdown renderer: `<!-- notka: {…} -->` holding a JSON object. |

## Body

| Block | Markdown |
| --- | --- |
| paragraph | the text |
| heading 1 / 2 / 3 | `## ` / `### ` / `#### ` |
| bullet | `- ` |
| numbered line | `1. ` |
| checklist row | `- [ ] ` or `- [x] ` |
| an indented list line | four spaces before the marker (the one level a list has) |

Inline: `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `<u>underline</u>`, `[text](url)`.
Characters that would otherwise be Markdown are escaped with a backslash, `<` and `>` as `&lt;` and
`&gt;`; inside a code span nothing is escaped.

Blocks of the same list follow each other directly; anything else is separated by one blank line. An
empty line of the note is written as one more blank line on each side of it, so two blank lines more
than a separator are one empty paragraph — which is what lets a note's empty lines survive the round
trip.

## Metadata

Every field is optional on import, and a value this app does not know is ignored rather than refused.

| Field | Value |
| --- | --- |
| `kind` | `TEXT` or `LIST`. Without it, a file whose every non-empty line is a checkbox is a list. |
| `color` | a palette id: `default`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `darkblue`, `purple`, `pink`, `brown`, `gray` |
| `background` | `groceries`, `food`, `music`, `recipes`, `notes`, `places`, `travel`, `video`, `celebration`, or `null` |
| `pinned`, `archived` | booleans |
| `reminderAt` | ISO 8601 with the writer's offset, or `null` |
| `reminderRepeat` | `daily`, `weekly`, `monthly`, `yearly`, or `null` |
| `created`, `updated` | ISO 8601; informational — an imported note is a new note and gets its own |

## Reading files from elsewhere

The import takes `.md`, `.markdown` and `.txt` files, and `.zip` archives of them (up to 1 MB a file,
50 MB an archive; hidden files and `__MACOSX` are skipped). A file without the comment is a plain
note; without a `# ` first line it has no title; `*`, `+` and `- ` all make bullets, any number with
`.` or `)` a numbered line, and two or more spaces (or a tab) of indentation the indented level.
Every note is created through the ordinary REST calls, so an import is checked exactly like typing
the notes in by hand.
