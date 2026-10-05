# task-list

A Claude Code mod: a side panel that shows a project's `TASKS.md` as a task list you can tick, edit, add to and drag, plus one tool (`tasks`) that lets agents read and change the same list.

## The one idea

`TASKS.md` is the product. The panel and the tool are two ways of editing it, and a text editor is a third. No task is stored anywhere else. Whatever you add must keep that true: read the file, change lines, write the file. The one thing kept outside it is how the person likes to look at the list (whether done tasks are hidden), which lives in the mod's own store.

## Where things are

| File | What it holds |
| --- | --- |
| `hooks/tasks.ts` | Every edit to the file, as pure functions on an array of lines. No engine, no UI. Start here. |
| `hooks/register.tsx` | The hooks: loads and saves the file, serves the `tasks` tool, turns the file into the rows the list draws, and applies what the list posts back. |
| `hooks/list.tsx` | The whole pane, as one `Client`: rows on a grid, hover, clicks told apart by column, dragging, and typing a name in its own row, key by key. It has no `$` and posts what the person did to `register.tsx`. |
| `check.ts` | Checks for `tasks.ts`. |
| `hooks/pane.test.ts` | Drives the panel and the tool through the engine on the terminal and desktop surfaces. |

## Checking a change

```bash
bun check.ts
```

```bash
claude plugin test .
```

```bash
claude plugin validate .
```

All three pass before a change is done. They prove the engine accepts the panel and that clicks, drags and tool calls change the file correctly. They cannot see the screen. A change to how something looks or lines up is not verified until a person has looked at it in the desktop app.

## What the file may contain

`tasks.ts` reads the file the way people and agents already write task lists, so that nobody has to be taught a format:

- A task is a checkbox item under any bullet: `- [ ]`, `* [x]`, `1. [X]`.
- A sublist is a heading of level two or deeper. A level-one heading is a title and is ignored.
- Lines indented under a task are its notes and move with it.
- Every other line stays exactly where it is and is never shown.

If an agent writes something reasonable and the panel does not show it, widen what `tasks.ts` accepts. Do not add a rule for agents to follow.

## The terminal

On the terminal surface `register.tsx` passes `isGrid` to the list. There every row is one row tall, a letter is one column, the list writes a sign (`+`, `>`, `×`) in each slot where the desktop has a picture laid under it, and the cursor is the letter it stands before, reversed out. Assumed, not seen: none of this has been looked at in a real terminal. The tests only show the engine accepts it and that clicks land on the rows drawn.

## Guards

The pane sends line numbers. Each act also sends `was`, the name it drew on that line, and `change` does nothing unless the file still has that name there. Keep that for any new act that edits a line.

## What the desktop app really does

Every line here was seen on a screenshot of a test pane that drew each case side by side, unless it says "assumed". The test kit only tells you the engine accepts a tree. It accepts props it then drops, so "accepted" never means "drawn".

Layout and size
- `margin`, `padding` and `gap` count rows and columns, and half steps draw (`paddingLeft={0.5}` is half a column). Negative margins draw too.
- `Svg` width and height are CSS pixels and a drawing with visible content takes that room. An empty or fully transparent one takes none.
- `position="absolute"` with `top`/`left`/`right` in whole cells places a Box over its siblings, including over a `Client`, and the hooks tree's cells line up with the `Client`'s. `position="relative"` offsets do nothing, as documented.
- A `Box` with a width in columns is exactly that wide inside a `Client`. That is what the click zones rely on.
- A `Box` height may be a half: a row 1.5 tall draws 1.5 rows tall inside a `Client`. The pointer still reports whole rows, so `tall` in `list.tsx` sets each row's height and start, and a click is matched to the row its grid row's middle falls in. `register.tsx` lays the icons out with the same `tall`, a box per row, so pictures and rows stay in step.
- In the hooks tree, `margin` and `padding` count a vertical step that is shorter than a row (about 0.6 of one), while `height` and `top` count rows. Vertical position is set with heights, not margins.

Text
- `Text wrap="truncate-end"` cuts with an ellipsis in the hooks tree. Inside a `Client` it cuts only when the text sits in a `Box` with `flexGrow`, `flexShrink`, `minWidth={0}`, `height={1}` and `overflow="hidden"`; bare, a long line pushes its neighbours onto another row.
- A `Client`'s columns are a little wider than the letters drawn in them, so a column per letter is always enough room.

Controls
- A `Button` is text you can click. It takes one string, no bold, colour or strike-through at rest, and no wrapping. `plain` draws it without a border. Its `hover` prop does take colour and weight.
- In the hooks tree an `Input` is a bordered field of fixed width with a bordered submit button welded to its right end. It does not stretch, whatever its parent.
- Inside a `Client` an `Input` draws as plain text with no border and no button, and typing and paste work in it. But it is one line of a fixed width (about 21 columns) whatever box it is put in, it gets the app's blue outline when focused, and it does not take the keyboard when it is hidden in a box of no width. That is why the list does not use it.
- `onKey` in a `Client` hears every key once a click has given the `Client` the keyboard, with `meta`, `ctrl` and `shift` but not Option. So `list.tsx` does its own typing: the name is drawn in the row, wrapped over as many rows as it needs, with its own cursor, selection and undo.
- A paste arrives only as the key cmd+v, with no text. The list posts `paste`; `register.tsx` runs `pbpaste` (macOS) and hands the text back in props.
- Hover styles (`hover` on `Box`, `Text`, `Button`) draw in the hooks tree. Inside a `Client` they do not, so `list.tsx` lights parts itself from pointer moves.
- An `Svg` cannot be pressed, a `Client` cannot draw one, and a picture laid over a `Client` takes every click that lands on it. A plain `Button` in an absolute `Box` over the picture can be pressed, but pressing a hooks-tree button takes the keyboard from the `Client`, which then hears no typing. So every icon is a picture laid *under* the `Client` (earlier in the tree; the `Client` sits in an absolute `Box` after them and is clear where it leaves a slot empty): the click and the hover are the `Client`'s, by column, like every other part of a row.
- A character is drawn by whichever font on the machine holds it, and the app's choice of font does not follow CoreText's. Two characters chosen as a pair came out at different sizes three times. Anything that must match, or be larger than the text, is a drawing.
- `Markdown` draws links, strike-through and images, and a link's press reaches `onLinkPress`.

Events
- Pointer events reach a `Client` on the first click, and report whole columns and rows only (`fine` is absent).
- The first click on a hooks-tree `Button` in a pane that does not hold the keyboard only moves focus. Nothing in the list is such a button except delete, which only shows once the pane has the keyboard.
- Pointer events arrive before the redraw that follows `setState`. A drag's state lives in a module variable for that reason.
- `$` may only be handed to functions declared at the top of the file. A closure stored for later may not take it, and the module will not load.
- Assumed: focus leaving the pane altogether raises nothing the mod sees, so text typed and then abandoned by clicking outside the pane is not kept.
