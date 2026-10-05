import type { ClientModule } from 'claude-code'

import { lay, rooms } from './tasks'


export type Row = {
  // 'more' is a further line of the task above it, shown while that task is opened out; 'top' is the
  // fixed heading over the tasks in no sublist; 'new' and 'newlist' are the row a new name is typed
  // in; 'foot' is one of the pane's last two rows: `label` 'list' starts a new sublist, and its `note`
  // is the words at its right end that hide the done tasks or show them again (empty when nothing is
  // done); `label` 'task' starts a new task in General, the tasks in no sublist
  // 'sub' is a sub-item of the task above it: a checkbox line indented under it in the file
  kind: 'task' | 'list' | 'gap' | 'more' | 'sub' | 'top' | 'new' | 'newlist' | 'foot'
  // the line of TASKS.md the row shows; for 'new', the heading line of the list it adds to
  line: number
  // the name as drawn in the row: all of it at rest, its first line when opened out; `name` is always all of it
  label: string
  name?: string
  isDone: boolean
  // drawn at the row's right edge: a sublist's count, or the mark that opens a task out
  note: string
  // a task whose every line is showing: the rest of a long name, and its notes
  isOpen?: boolean
  // a 'more' row that is one of the task's notes, not part of its name
  isNote?: boolean
  // the task or sublist whose name is being typed over, in this row
  isTyping?: boolean
  // a 'more' row kept under an open field for the list to write the name in, whole, as it is typed
  isLive?: boolean
}
// `paste` is the clipboard as the hooks module last read it for this list; `n` tells one read from the next
// `wide` is the pane's width in columns as the hooks module last heard it from this list
// `hasKeys` is whether the pane holds the keyboard
// `isGrid` is a terminal: whole rows and columns only, a letter to a column, and no pictures
type Props = { rows: Row[]; paste: { n: number; text: string }; wide: number; hasKeys: boolean; isGrid: boolean }
type Held = { from: number; over: number } | null

// How tall each row stands, in rows of the grid, and how far down it starts. Everything is in
// thirds of a row. An item has a third of a row of air under it, which is what sets one item apart
// from the next; the rows that run on from an item (the rest of its name, its notes, its
// sub-items) follow with none, so that an item's own lines sit closer than separate items do, and a
// heading sits as close to its first task. Between groups there is a further two thirds: a group
// is three times as far from the next as an item is from the next. A row never moves when it is
// opened out, since nothing here depends on whether it is.
//
// The pointer reports whole rows of the grid, so a click is matched to the row that the middle of
// its grid row falls in. Thirds are what make that safe: a grid row's middle then never lands on
// the join between two rows, as it would with halves, where a click on the lower half of one line
// of a name would be read as the line under it.
// A terminal draws whole rows only: there every row is one row tall, and so is the gap between groups.
const THIRD = 1 / 3
export const tall = (rows: Row[], isGrid = false) => {
  const runsOn = (row?: Row) => row?.kind === 'more' || row?.kind === 'sub'
  let thirds = 0

  return rows.map((row, index) => {
    const high = isGrid ? 3 : row.kind === 'gap' ? 2 : 3 + (runsOn(rows[index + 1]) ? 0 : 1)
    const size = { off: thirds * THIRD, top: 0, height: high * THIRD, from: thirds, to: thirds + high }
    thirds += high

    return size
  })
}

// The press in hand. It lives outside the drawing so that the pointer's next event reads it at once:
// kept only in the drawn state, a move that arrives before the redraw sees no press and is dropped.
// (`at` is where in a name being typed a press landed, when it landed in one: dragging from there selects)
let grab: { from: number; over: number; isGrip: boolean; at?: number } | null = null
// when and where the last press in a name being typed landed, to tell a double click
let lastPress = { time: 0, at: -1 }
// The name being typed, by the key of the row it is typed in. Typing is done here, key by key: the
// list hears every key and draws the name itself, in the row, wrapped over as many rows as it
// needs. (The surface's own field is one line of a fixed width and cannot be hidden and still
// typed in.) `mark` is the other end of a selection, when there is one; `past` is what undo returns to.
type Typing = { key: string; text: string; caret: number; mark: number | null; past: { text: string; caret: number }[] }
let typed: Typing | null = null
let pasted = 0
// whether the pane has been seen holding the keyboard since the name being typed was opened
let heldKeys = false
// whether the pane held the keyboard when the list was last drawn
let hadKeys = false
// The part of a row under the pointer, as "row:part". The list lights it itself, from the same
// reading of the pointer that decides what a click there does, so what lights is what will act.
// (The surface's own hover styles do not draw inside a Client on the desktop.)
let hot = ''
// The cursor blinks as any cursor does: shown for half a second, gone for half, and shown without
// a break while the person is typing or has just clicked.
let isBlinkOn = true
let lastTouch = 0
let stopBlink: (() => void) | null = null
type Part = 'grip' | 'tick' | 'name' | 'pencil' | 'arrow' | 'plus' | 'bin' | 'close' | 'task' | 'list' | 'hide' | ''
// The columns each part of a row is given. Each part is drawn in a box of exactly that width, and
// the pointer reports columns, so the part a click lands in is the part that is drawn there.
const GRIP = 2
const CIRCLE = 2
const EDGE = 3
// the air between a row's circle and its name: a column
const AIR = 1
// how far a sublist's name stands in from its grip: a quarter column, which sets it over the circles of its tasks
const HEAD = 0.25
// the letters a column holds, near enough to turn a click's column into a place in a name
const LETTERS = 1.3
// the columns each of the foot row's starts takes: a slot for its plus, then its words
export const FOOT = 13

// The pane's greys. A sublist's name is the text colour, and so is whatever is under the pointer.
// A task's name, counts, notes and the foot's words are the theme's own dim; a done task's name
// and the circle before any name are a mid grey; the grip, which is only wanted when reached
// for, is fainter still. A mid grey reads on a light theme and a dark one alike.
const MID = 'rgba(127, 127, 127, 0.95)'
const FAINT = 'rgba(127, 127, 127, 0.5)'
const WASH = 'rgba(127, 127, 127, 0.16)'
// the parts of a row that are icons: pictures the hooks module draws
const ICONS = ['plus', 'pencil', 'arrow', 'bin', 'close', 'task', 'list']
// what stands in a picture's slot on a terminal, which has no pictures: the list writes these itself
const SIGNS: Record<string, string> = { plus: '+', pencil: 'edit', bin: '-', close: '×', task: '+', list: '+' }

// The whole pane: one row per task or sublist on the surface's own grid, which is what lets the
// pointer be matched to a row. A press and release on one row is a click (the circle ticks, a name
// opens the task out, a + starts a new one); a press on a
// grip carried to another row drags the task, or the sublist and its tasks, there, and while it is
// held the rows are drawn in the order a release would leave them. Every change is posted to the
// hooks module, which owns the file.
const List: ClientModule<Props, Held> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { rows } = props
  const held = surface.state ?? null
  // the row a pointer is over; -1 when it is over the empty part of the pane, under the last row
  // the row the middle of a grid row falls in, going by how tall each row stands
  const base = tall(rows, props.isGrid)
  const rowAt = (y: number) => base.findIndex(size => y * 3 + 1.5 >= size.from && y * 3 + 1.5 < size.to)
  const isNamed = (row: Row | undefined) => row?.kind === 'task' || row?.kind === 'list'
  // the one row with a field in it, if any: a name being typed over, or a new name
  const typing = rows.findIndex(row => row.isTyping || row.kind === 'new' || row.kind === 'newlist')
  // (the key must not change while the name is typed: the rows under it come and go as it wraps)
  const fieldKey = typing < 0 ? '' : isNamed(rows[typing]) ? `name-${rows[typing].line}` : `${rows[typing].kind}-${rows[typing].line}`
  if (typed && typed.key !== fieldKey) typed = null
  if (typing >= 0 && !typed) {
    const start = isNamed(rows[typing]) ? (rows[typing].name ?? rows[typing].label) : ''
    typed = { key: fieldKey, text: start, caret: start.length, mark: null, past: [] }
    // a read of the clipboard from before this name was opened is not a paste into it
    pasted = props.paste.n
    heldKeys = false
  }
  // One edit of the name: `from`..`to` is replaced by `put`, and the edit can be undone.
  const edit = (from: number, to: number, put: string) => {
    if (!typed) return
    const text = typed.text.slice(0, from) + put + typed.text.slice(to)
    typed = { ...typed, text, caret: from + put.length, mark: null, past: [...typed.past, { text: typed.text, caret: typed.caret }].slice(-100) }
  }
  const span = (): [number, number] => (typed.mark === null ? [typed.caret, typed.caret] : [Math.min(typed.mark, typed.caret), Math.max(typed.mark, typed.caret)])
  // What the hooks module read off the clipboard goes in at the cursor, once, as one line. This
  // comes before the name is laid out, so the rows drawn are the rows of the name as pasted into.
  if (typed && props.paste.n !== pasted) edit(...span(), props.paste.text.replace(/\s+/g, ' '))
  pasted = props.paste.n
  // the name as lines of the pane's width, each a stretch of the text
  // (on a terminal the name is typed in the terminal's own field, laid over the row: the list keeps one empty line for it)
  const lines: [number, number][] = !typed ? [] : props.isGrid ? [[0, 0]] : lay(typed.text, ...rooms(surface.columns, props.isGrid))
  // the hooks module lays out the rows, so it is told how wide the pane is and how many rows the name needs now
  if (surface.columns > 0 && props.wide !== surface.columns) surface.post({ act: 'wide', n: surface.columns })
  const kept = rows.filter(row => row.isLive).length
  if (typed && surface.columns > 0 && lines.length - 1 !== kept) surface.post({ act: 'rows', n: lines.length - 1 })

  // The rows in blocks: the tasks above the first sublist, then each sublist with the blank row
  // over it, its name and its tasks. A sublist is carried, and lands, as one block.
  const blocks: number[][] = [[]]
  rows.forEach((row, index) => {
    if (row.kind === 'foot') return
    if (row.kind === 'gap' || (row.kind === 'list' && rows[index - 1]?.kind !== 'gap')) blocks.push([])
    blocks.at(-1).push(index)
  })
  const blockOf = (index: number) => blocks.findIndex(block => block.includes(index))
  const lastList = blocks.findLastIndex(block => block.some(index => rows[index].kind === 'list'))
  const landing = (over: number) => Math.min(Math.max(1, blockOf(over) < 0 ? lastList : blockOf(over)), lastList)

  // which part of a row a column falls in: the one reading that both hover and click go by
  // Every icon is a picture the hooks module lays under the list, in a slot the list leaves clear;
  // the click and the light under the pointer are the list's, the same for each of them.
  const partOf = (row: Row | undefined, x: number): Part => {
    // which slot from the right edge a column is in: 0 the last three columns, 1 the three before
    const fromRight = surface.columns > 0 ? Math.floor((surface.columns - 1 - x) / EDGE) : 9
    if (!row || row.kind === 'gap') return ''
    // the row a name is typed in: the cross closes it, and a name that exists has its bin beside that
    if (row.isTyping || row.kind === 'new' || row.kind === 'newlist') return fromRight === 0 ? 'close' : fromRight === 1 && row.isTyping ? 'bin' : ''
    // the foot: what it starts stands at its left, and at its right, under the counts, the words that hide what is done
    if (row.kind === 'foot') {
      if (row.note && x >= surface.columns - 1 - row.note.length) return 'hide'

      return x < FOOT ? (row.label === 'task' ? 'task' : 'list') : ''
    }
    if (row.kind === 'top') return fromRight === 0 ? 'plus' : ''
    // a further line of a task's name is the task's name; a note is only to be read
    if (row.kind === 'more') return row.isNote ? '' : 'name'
    // a sub-item stands in under its task: its circle is where the task's name starts
    if (row.kind === 'sub') return x >= GRIP + CIRCLE + AIR && x < GRIP + 2 * CIRCLE + AIR ? 'tick' : ''
    if (x < GRIP) return 'grip'
    if (row.kind === 'list') return fromRight === 0 ? 'plus' : 'name'
    // a task with more to show has its arrow, and once opened out, its pencil beside that
    if (fromRight === 0 && (row.isOpen || row.note !== '')) return row.note !== '' ? 'arrow' : ''
    // (a terminal's pencil is a word four columns wide)
    if (row.isOpen && (props.isGrid ? surface.columns - 1 - x >= EDGE && surface.columns - 1 - x < EDGE + 4 : fromRight === 1)) return 'pencil'

    return x < GRIP + CIRCLE ? 'tick' : 'name'
  }
  // Where in the name being typed a column of a row falls, as near as a column can say (letters are
  // narrower than columns, and of different widths); null when the row is not one of the name's.
  const placeAt = (row: number, x: number) => {
    const span = lines[row - typing]
    if (typing < 0 || !span) return null
    // a sublist's name starts at its grip's edge, on its own row; a task's stands in past its circle
    const isHead = row === typing && (rows[typing].kind === 'list' || rows[typing].kind === 'newlist')
    const left = isHead ? GRIP : GRIP + CIRCLE + AIR

    return Math.max(span[0], Math.min(span[1], span[0] + Math.round(Math.max(0, x - left) * (props.isGrid ? 1 : LETTERS))))
  }
  // A grey that is a step back from the text: on a terminal, which has no see-through colours, the theme's own dim.
  const grey = (tone: string) => (props.isGrid ? { dimColor: true } : { color: tone })
  const redraw = () => surface.setState(surface.state ? { ...surface.state } : null)
  if (surface.state === undefined) {
    stopBlink?.()
    stopBlink = surface.every(530, () => {
      if (!typed) return
      isBlinkOn = Date.now() - lastTouch < 530 || !isBlinkOn
      redraw()
    })
  }
  const lit = (index: number, part: Part) => !grab && hot === `${index}:${part}`
  // a task's name may run over several rows: the pointer on any one of them lights them all
  const [hotRow, hotPart] = hot.split(':')
  const isNameLit = (row: Row) => !grab && hotPart === 'name' && rows[Number(hotRow)]?.line === row.line && rows[Number(hotRow)]?.kind !== 'list'

  // Enter, or a click anywhere else in the list: keep what was typed.
  const keep = () => {
    const row = rows[typing]
    const name = (typed?.text ?? '').trim()
    typed = null
    if (isNamed(row)) surface.post(name && name !== (row.name ?? row.label) ? { act: 'rename', line: row.line, name, was: row.name ?? row.label } : { act: 'close' })
    else if (!name) surface.post({ act: 'close' })
    else surface.post(row.kind === 'newlist' ? { act: 'createList', name } : { act: 'create', line: row.line, name })
  }
  // The pane giving up the keyboard (a click into the chat, say) is a click away too. Only a change
  // from holding it to not holding it counts, so a surface that never reports holding it closes nothing.
  if (typed && props.hasKeys) heldKeys = true
  // (not on a terminal: there the name is typed in the terminal's own field, and any click in the
  // list takes the keyboard from that field first, so the click itself says what it is for)
  if (typed && heldKeys && !props.hasKeys && !props.isGrid) keep()
  // from here on `typed` may be null with a typing row still in `rows`: nothing below may assume it
  // A task that is opened out shuts when the person clicks away from it: on an empty part of the
  // list here, or out of the pane, which is the pane giving up the keyboard.
  const isOut = rows.some(row => row.isOpen)
  if (isOut && typing < 0 && hadKeys && !props.hasKeys) surface.post({ act: 'shut' })
  hadKeys = props.hasKeys
  const lineOf = (at: number) => Math.max(0, lines.findIndex(([start, end], index) => at >= start && (at < end || index === lines.length - 1)))

  surface.onKey(e => {
    if (!typed) return
    lastTouch = Date.now()
    const { text, caret, mark } = typed
    const [from, to] = span()
    const hasSpan = from !== to
    // moves the cursor; with shift held the other end of the selection stays where it was
    const go = (at: number) => {
      typed = { ...typed, caret: Math.max(0, Math.min(text.length, at)), mark: e.shift ? (mark ?? caret) : null }
    }
    const line = lines[lineOf(caret)]
    const letter = e.key === 'space' ? ' ' : e.key
    if (e.key === 'return') return keep()
    if (e.meta && e.key === 'v') return surface.post({ act: 'paste' })
    if (e.meta && e.key === 'a') typed = { ...typed, mark: 0, caret: text.length }
    else if (e.meta && (e.key === 'c' || e.key === 'x')) {
      if (hasSpan) surface.post({ act: 'copy', name: text.slice(from, to) })
      if (hasSpan && e.key === 'x') edit(from, to, '')
    } else if (e.meta && e.key === 'z') {
      const last = typed.past.at(-1)
      if (last) typed = { ...typed, ...last, mark: null, past: typed.past.slice(0, -1) }
    } else if (e.key === 'backspace') edit(hasSpan ? from : e.meta ? line[0] : Math.max(0, caret - 1), hasSpan ? to : caret, '')
    else if (e.key === 'delete') edit(from, hasSpan ? to : Math.min(text.length, caret + 1), '')
    else if (e.key === 'left') go(e.meta ? line[0] : hasSpan && !e.shift ? from : caret - 1)
    else if (e.key === 'right') go(e.meta ? line[1] : hasSpan && !e.shift ? to : caret + 1)
    else if (e.key === 'home') go(line[0])
    else if (e.key === 'end') go(line[1])
    else if (e.key === 'up' || e.key === 'down') {
      // to the same place in the line above or below; off the first or last line, to the name's end
      const next = lines[lineOf(caret) + (e.key === 'up' ? -1 : 1)]
      go(next ? Math.min(next[0] + (caret - line[0]), next[1]) : e.key === 'up' ? 0 : text.length)
    } else if (!e.meta && !e.ctrl && [...letter].length === 1) edit(from, to, letter)
    else return
    redraw()
  })

  surface.onPointer(e => {
    const at = rowAt(e.fine?.y ?? e.y)
    if (e.type === 'leave' || (e.type === 'move' && !grab)) {
      // while a name is typed, only the icons of its own row light: a click anywhere else just keeps it
      const now = e.type === 'leave' || (typing >= 0 && at !== typing) ? '' : `${at}:${partOf(rows[at], e.x)}`
      if (now !== hot) {
        // An icon is the hooks module's picture, so it is told when the pointer comes onto one or
        // leaves it, and draws that picture in the text colour; the rest the list lights itself.
        const icon = (key: string) => (ICONS.some(part => key.endsWith(`:${part}`)) ? key : '')
        if (icon(now) !== icon(hot)) surface.post({ act: 'hot', name: icon(now) })
        hot = now
        redraw()
      }
    } else if (e.type === 'down' && e.button === 'left' && typed && placeAt(at, e.x) !== null && !(at === typing && partOf(rows[at], e.x) !== '')) {
      // A press in the name being typed puts the cursor there, and a drag from it selects. A second
      // press on the same spot straight after selects the word under it.
      const place = placeAt(at, e.x)
      lastTouch = Date.now()
      const isDouble = Date.now() - lastPress.time < 400 && Math.abs(lastPress.at - place) <= 1
      lastPress = { time: Date.now(), at: place }
      const word = [typed.text.lastIndexOf(' ', place - 1) + 1, typed.text.indexOf(' ', place)]
      typed = isDouble ? { ...typed, mark: word[0], caret: word[1] < 0 ? typed.text.length : word[1] } : { ...typed, caret: place, mark: null }
      grab = { from: at, over: at, isGrip: false, at: isDouble ? undefined : place }
      redraw()
    } else if (e.type === 'move' && grab && grab.at !== undefined && typed) {
      // the pointer carried on from a press in the name: everything between is selected
      const to = placeAt(at < 0 ? typing + lines.length - 1 : Math.max(typing, Math.min(typing + lines.length - 1, at)), e.x)
      if (to !== null && to !== typed.caret) {
        typed = { ...typed, caret: to, mark: to === grab.at ? null : grab.at }
        redraw()
      }
    } else if (e.type === 'down' && e.button === 'left') {
      // with a name open, a press anywhere counts, the blank rows too: it is a click away from the name
      if ((typing >= 0 || isOut) && !rows[at]) grab = { from: -1, over: -1, isGrip: false }
      else if (rows[at] && (typing >= 0 || isOut || rows[at].kind !== 'gap')) grab = { from: at, over: at, isGrip: typing < 0 && isNamed(rows[at]) && partOf(rows[at], e.x) === 'grip' }
    } else if (e.type === 'move' && grab) {
      if (grab.isGrip && at >= 0 && at !== grab.over) {
        grab.over = at
        surface.setState({ from: grab.from, over: at })
      }
    } else if (e.type === 'up' && grab) {
      const { from, over, isGrip } = grab
      const row = rows[from]
      grab = null
      // a click under the last row, with a name open, is a click away from it
      if (!row && typing >= 0) return keep()
      // a click on an empty part of the list is a click away from a task that is opened out
      if ((!row || row.kind === 'gap') && typing < 0) return isOut ? surface.post({ act: 'shut' }) : undefined
      if (!row) return
      if (typing >= 0) {
        // The cross at the typing row's right edge closes it unkept. A press in the name was dealt
        // with when it landed. A click anywhere else keeps what was typed.
        const lineAt = from - typing
        if (lineAt < 0 || lineAt >= lines.length) keep()
        else if (lineAt === 0 && partOf(row, e.x) === 'close') {
          typed = null
          surface.post({ act: 'close', isCancel: true })
        } else if (lineAt === 0 && partOf(row, e.x) === 'bin') {
          typed = null
          surface.post({ act: 'remove', line: row.line, was: row.name ?? row.label })
        }

        return
      }
      if (isGrip && row.kind === 'list') {
        // a sublist is dropped among the sublists: it takes the place of the one it was let go over
        if (landing(over) !== blockOf(from)) surface.post({ act: 'place', line: row.line, to: landing(over) - 1, was: row.name })
      } else if (isGrip && over !== from) {
        // held over row r the task takes r's place: after it going down, before it going up
        const slot = over > from ? over + 1 : over
        const next = rows.slice(slot).find(other => isNamed(other) && other !== row)
        surface.post({ act: 'drop', line: row.line, before: next ? next.line : null, was: row.name })
      } else if (!isGrip) {
        // a press on the grip that went nowhere is no click on anything
        // a task's name opens the task out, and shuts it again; a sublist's name is typed over where it stands
        const act = { tick: row.kind === 'sub' ? 'tickSub' : 'tick', plus: 'add', pencil: 'edit', arrow: 'more', name: row.kind === 'list' ? 'edit' : 'more', task: 'add', list: 'addList', hide: 'hide' }[partOf(row, e.x)]
        // (`was` is the name as drawn: the hooks module changes nothing if the file no longer has it on that line)
        if (act) surface.post({ act, line: row.line, was: row.name ?? row.label })
      }
      surface.setState(null)
    }
  })

  const isDragging = held !== null && held.over !== held.from && rows[held.from] !== undefined
  let order = rows.map((_, index) => index)
  if (isDragging && rows[held.from].kind === 'list') {
    const moved = [...blocks]
    moved.splice(landing(held.over), 0, ...moved.splice(blockOf(held.from), 1))
    order = [...moved.flat(), ...order.filter(index => rows[index].kind === 'foot')]
  } else if (isDragging) order.splice(held.over, 0, ...order.splice(held.from, 1))

  // a part's box: exactly as wide as the columns the pointer is read against
  const part = (width: number, child: unknown) => (
    <Box width={width} flexShrink={0}>
      {child}
    </Box>
  )
  // a slot the hooks module lays a picture under: clear, so the picture shows
  // (a terminal has no pictures, so there the list writes the sign itself)
  // (a terminal has no drawing that reads as a pencil, so there it is the word, in a slot a column wider)
  const slot = (index: number, what: Part) =>
    props.isGrid && what === 'pencil'
      ? part(4, <Text dimColor={!lit(index, what)}>{SIGNS.pencil}</Text>)
      : part(EDGE, <Text dimColor={!lit(index, what)}>{props.isGrid ? ` ${what === 'arrow' ? (rows[index].isOpen ? 'v' : '>') : SIGNS[what]}` : ' '}</Text>)
  const grip = (index: number, isLive: boolean) =>
    part(
      GRIP,
      isLive ? (
        <Text {...(held?.from === index || lit(index, 'grip') ? {} : grey(FAINT))}>⠿</Text>
      ) : (
        <Text dimColor> </Text>
      ),
    )
  // a name takes the room that is left and is cut at its own edge, whatever letters are in it
  const name = (child: unknown) => (
    <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden" paddingLeft={AIR}>
      {child}
    </Box>
  )
  // One line of the name being typed: its letters, the selection reversed out, and the cursor.
  // (a sublist's name stands a quarter column in, a task's a whole one: typed, each stays where it stood)
  const typedLine = (lineAt: number, isBold: boolean) => {
    if (props.isGrid) return name(<Text> </Text>)
    const [start, end] = lines[lineAt] ?? [0, 0]
    const [from, to] = span()
    const cut = (a: number, b: number) => typed.text.slice(Math.max(start, Math.min(end, a)), Math.max(start, Math.min(end, b)))
    const isHere = typed.mark === null && lineOf(typed.caret) === lineAt
    const hint = rows[typing].kind === 'newlist' ? 'New list' : 'New task'

    return (
      <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden" flexDirection="row" paddingLeft={isBold ? HEAD : AIR}>
        <Text bold={isBold}>{cut(start, isHere ? typed.caret : from)}</Text>
        {/* The cursor is a bar in the text colour, centred in a box a quarter column wide: a hair
            of room either side of it, so it does not touch the letters it stands between. The box
            stays when the bar blinks off, so the letters do not move as it blinks. */}
        {isHere && !props.isGrid && (
          <Box width={0.25} flexShrink={0} flexDirection="row" justifyContent="center">
            <Text>{isBlinkOn || Date.now() - lastTouch < 530 ? '|' : ' '}</Text>
          </Box>
        )}
        {/* a terminal has no room between two letters: its cursor is the letter it stands before, reversed out */}
        {isHere && props.isGrid && <Text inverse>{cut(typed.caret, typed.caret + 1) || ' '}</Text>}
        {!isHere && from !== to && <Text inverse>{cut(from, to)}</Text>}
        <Text bold={isBold}>{cut(isHere ? typed.caret + (props.isGrid ? 1 : 0) : to, end)}</Text>
        {!typed.text && isNamed(rows[typing]) === false && <Text dimColor>{hint}</Text>}
      </Box>
    )
  }
  // The row a name is typed in is the row it stands for, with the name live where it stood. The
  // three columns before the cross are left empty: the hooks module draws delete there.
  const field = (index: number) => {
    const row = rows[index]
    const isList = row.kind === 'list' || row.kind === 'newlist'

    return (
      <Box flexDirection="row" height={1}>
        {grip(index, false)}
        {!isList && part(CIRCLE, <Text {...grey(MID)}>{row.isDone ? '✓' : '○'}</Text>)}
        {typedLine(0, isList)}
        {isNamed(row) ? slot(index, 'bin') : part(EDGE, <Text> </Text>)}
        {slot(index, 'close')}
      </Box>
    )
  }

  // each row in the height it stands at, its text at the top of it under any air it has above
  const sizes = tall(order.map(index => rows[index]), props.isGrid)
  // A terminal keeps whatever was last written in a cell until something is written over it, so
  // there each row first writes spaces across the whole of itself: a row that moved leaves nothing behind.
  const across = ' '.repeat(Math.max(0, surface.columns))
  const frame = (nth: number, drawn: unknown) =>
    props.isGrid ? (
      <Box height={1}>
        <Box position="absolute" top={0} left={0}>
          <Text>{across}</Text>
        </Box>
        {rows[order[nth]].kind === 'gap' ? null : drawn}
      </Box>
    ) : rows[order[nth]].kind === 'gap' ? (
      <Box height={sizes[nth].height} />
    ) : (
      <Box flexDirection="column" height={sizes[nth].height} paddingTop={sizes[nth].top}>
        {drawn}
      </Box>
    )

  return (
    <Box flexDirection="column">
      {order.map((index, nth) => frame(nth, (() => {
        const row = rows[index]
        // (a name just kept is no longer being typed, though its row is still here until the hooks module answers)
        if (index === typing && typed) return field(index)
        if (row.kind === 'gap' || row.kind === 'new' || row.kind === 'newlist') return <Text> </Text>
        if (row.kind === 'foot')
          return (
            <Box flexDirection="row" height={1}>
              {/* each start is a plus (a picture, under its slot) and its words; both go to the text colour together */}
              {[[row.label, row.label === 'task' ? 'New task' : 'New list']].map(([what, words]) => (
                <Box width={FOOT} flexShrink={0} flexDirection="row">
                  {/* the plus stands in the column of the circles, and its words where the names of tasks start */}
                  {part(GRIP - 1, <Text> </Text>)}
                  {slot(index, what as Part)}
                  {part(AIR, <Text> </Text>)}
                  <Text dimColor={!lit(index, what as Part)}>{words}</Text>
                </Box>
              ))}
              {/* looking, not making: it stands apart at the row's other end, as quiet as the counts,
                  and ends where the pictures above it end (a picture sits half a column in from the pane's edge) */}
              <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden" flexDirection="row" justifyContent="flex-end" paddingRight={0.5}>
                <Text {...(lit(index, 'hide') ? {} : grey(MID))}>{row.note}</Text>
              </Box>
            </Box>
          )
        if (row.kind === 'list' || row.kind === 'top')
          return (
            <Box flexDirection="row" height={1}>
              {grip(index, row.kind === 'list')}
              {/* a heading's name starts over the circles of the tasks under it, which stand in from it */}
              <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden" paddingLeft={HEAD}>
                <Text bold wrap="truncate-end">
                  {row.label}
                </Text>
              </Box>
              <Box flexShrink={0} paddingLeft={1}>
                {/* a count is the least of what a heading says: a step greyer than a task's name, done or not */}
                <Text {...grey(MID)}>{row.note}</Text>
              </Box>
              {slot(index, 'plus')}
            </Box>
          )
        const isHeld = isDragging && held.from === index
        const label = (
          // A task's name rests a step back from the text colour and comes up to it under the pointer,
          // as the icons do. A done one rests further back again, struck through.
          <Text
            bold={isHeld}
            dimColor={!row.isDone && !isHeld && !isNameLit(row)}
            {...(row.isDone && !isHeld && !isNameLit(row) ? grey(MID) : {})}
            strikethrough={row.isDone}
            wrap="truncate-end"
          >
            {row.label}
          </Text>
        )
        if (row.isLive)
          return (
            <Box flexDirection="row" height={1}>
              {part(GRIP + CIRCLE, <Text> </Text>)}
              {typed && index - typing < lines.length ? typedLine(index - typing, false) : name(<Text> </Text>)}
            </Box>
          )
        // What is under a task stands in from its name, and is a step greyer. A sub-item has its own
        // circle, where the task's name starts; a note is text only, on the same edge as a sub-item's name.
        if (row.kind === 'sub' || row.isNote)
          return (
            <Box flexDirection="row" height={1}>
              {part(GRIP + CIRCLE + AIR, <Text> </Text>)}
              {part(CIRCLE, row.kind === 'sub' ? <Text {...(lit(index, 'tick') ? {} : grey(MID))}>{row.isDone ? '✓' : '○'}</Text> : <Text> </Text>)}
              <Box flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
                <Text {...grey(MID)} strikethrough={row.kind === 'sub' && row.isDone} wrap="truncate-end">
                  {row.label}
                </Text>
              </Box>
            </Box>
          )
        if (row.kind === 'more')
          return (
            <Box flexDirection="row" height={1}>
              {part(GRIP + CIRCLE, <Text> </Text>)}
              {name(label)}
            </Box>
          )

        return (
          <Box flexDirection="row" height={1} {...(isHeld ? { backgroundColor: WASH } : {})}>
            {grip(index, true)}
            {part(
              CIRCLE,
              <Text {...(lit(index, 'tick') ? {} : grey(MID))}>{row.isDone ? '✓' : '○'}</Text>,
            )}
            {name(label)}
            {/* the slots the hooks module draws in: the pencil of an opened-out task, then its arrow */}
            {row.isOpen && slot(index, 'pencil')}
            {(row.isOpen || row.note !== '') && (row.note !== '' ? slot(index, 'arrow') : part(EDGE, <Text> </Text>))}
          </Box>
        )
      })()))}
      {/* and the rows under the last one, which the list may have just given back */}
      {props.isGrid && Array.from({ length: Math.max(0, surface.rows - order.length) }, () => <Text>{across}</Text>)}
    </Box>
  )
}

export default List
