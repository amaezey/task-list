// Pure edits on the lines of TASKS.md, which is read the way people and agents write task lists:
// a task is a checkbox item under any bullet (`- [ ]`, `* [x]`, `1. [ ]`), a sublist is a heading
// of level two or deeper, and the lines indented under a task (notes, sub-items) are that task's
// own and travel with it. Everything else in the file is left where it is. The lines above the
// first sublist are the top list; `head` is a heading's line, -1 for the top list.
export const TASK = /^(?:[-*+]|\d+[.)]) \[( |x)\] (.*)$/i
export const LIST = /^#{2,6} (.+)$/

// A code block (lines fenced by ``` or ~~~ at the start of a line) is text to be read as written:
// nothing in it is a task or a sublist. `shield` marks its lines as the file is read, so that no
// rule here takes one for either, and `bare` takes the marks off again before the file is written.
// (A fence that is never closed runs to the end of the file, as it does wherever markdown is shown.)
const MARK = '\uE000'
export const shield = (text: string) => {
  let isInside = false

  return text
    .split('\n')
    .map(line => {
      const isFence = /^(```|~~~)/.test(line)
      const out = isInside || isFence ? MARK + line : line
      if (isFence) isInside = !isInside

      return out
    })
    .join('\n')
}
export const bare = (text: string) => text.replaceAll(MARK, '')

export const isOpen = (line = '') => TASK.exec(line)?.[1] === ' '
export const isDone = (line = '') => TASK.test(line) && !isOpen(line)
export const nameOf = (line = '') => TASK.exec(line)?.[2] ?? LIST.exec(line)?.[1]

export const toggle = (lines: string[], index: number) =>
  lines.map((line, i) => (i === index ? line.replace(/\[( |x)\]/i, (_, mark) => (mark === ' ' ? '[x]' : '[ ]')) : line))

// the line after a task and the indented lines that belong to it
// (a blank line inside a note does not end it: the indented lines after the blank are still the task's)
const end = (lines: string[], index: number) => {
  let at = index + 1
  for (let next = at; next < lines.length; next++) {
    if (/^\s+\S/.test(lines[next])) at = next + 1
    else if (lines[next].trim()) break
  }

  return at
}
const depth = (line: string) => line.length - line.trimStart().length
// the file without a task, and the task with what belongs to it
const lift = (lines: string[], index: number): [string[], string[]] => [
  [...lines.slice(0, index), ...lines.slice(end(lines, index))],
  lines.slice(index, end(lines, index)),
]

// What is indented under a task, line by line: `item` is the name of a sub-item (an indented
// checkbox line, which can be ticked where it stands) and is absent for a line of note.
export const under = (lines: string[], index: number) =>
  lines.slice(index + 1, end(lines, index)).map((line, n) => {
    const item = TASK.exec(line.trim())

    return { line: index + 1 + n, text: item ? item[2] : line.trim(), item: item !== null, isDone: item !== null && item[1] !== ' ' }
  }).filter(one => one.item || one.text)

// a task's notes: the lines indented under it, as written but for the indent
export const notesOf = (lines: string[], index: number) => lines.slice(index + 1, end(lines, index)).map(line => line.trim()).filter(Boolean)

// Sets a task's note: the plain lines indented under it are replaced by `note`'s, and an empty
// note takes them away. Sub-items under the task (indented checkbox lines) are left as they are.
export const setNote = (lines: string[], index: number, note: string) => {
  const stop = end(lines, index)
  const kids = lines.slice(index + 1, stop).filter(line => line.trim())
  // a sub-item stays, and so does whatever is indented further in, which is a sub-item's own
  const items = kids.filter(line => TASK.test(line.trim()) || depth(line) > depth(kids[0]))
  const text = note.split('\n').map(line => line.trim()).filter(Boolean).map(line => `  ${line}`)

  return [...lines.slice(0, index + 1), ...text, ...items, ...lines.slice(stop)]
}

// adds lines of note under a task: after the notes it has, above its sub-items
export const addNote = (lines: string[], index: number, note: string) => {
  const stop = end(lines, index)
  const item = lines.findIndex((line, at) => at > index && at < stop && TASK.test(line.trim()))
  const at = item < 0 ? stop : item

  return [...lines.slice(0, at), ...note.split('\n').map(line => line.trim()).filter(Boolean).map(line => `  ${line}`), ...lines.slice(at)]
}

export const remove = (lines: string[], index: number) => lift(lines, index)[0]

// removes a sub-item, with whatever is indented further in under it
export const removeSub = (lines: string[], index: number) => {
  let stop = index + 1
  while (stop < lines.length && lines[stop].trim() && depth(lines[stop]) > depth(lines[index])) stop++

  return [...lines.slice(0, index), ...lines.slice(stop)]
}

// adds a sub-item at the bottom of what is under a task
export const addUnder = (lines: string[], index: number, name: string) => {
  const at = end(lines, index)

  return [...lines.slice(0, at), `  - [ ] ${name}`, ...lines.slice(at)]
}

// adds lines at the bottom of a list, above the blank lines that close it
export const insert = (lines: string[], head: number, add: string | string[]): [string[], number] => {
  let at = head + 1
  while (at < lines.length && !LIST.test(lines[at])) at++
  while (at > head + 1 && !lines[at - 1].trim()) at--
  // the comment at the top of the file stands a blank line apart from the first task under it
  const gap = lines[at - 1]?.startsWith('<!--') ? [''] : []

  return [[...lines.slice(0, at), ...gap, ...[add].flat(), ...lines.slice(at)], at + gap.length]
}

export const addList = (lines: string[], name: string) => {
  const kept = lines.join('\n').trimEnd()

  return `${kept}${kept ? '\n\n' : ''}## ${name}\n`.split('\n')
}

export const headOf = (lines: string[], index: number) => {
  let head = index
  while (head >= 0 && !LIST.test(lines[head])) head--

  return head
}

// the file as its top list and one block of lines per sublist, trailing blank lines trimmed
const blocks = (lines: string[]): [string[], string[][]] => {
  const heads = lines.flatMap((line, index) => (LIST.test(line) ? [index] : []))
  const trim = (block: string[]) => block.slice(0, block.findLastIndex(line => line.trim()) + 1)

  return [trim(lines.slice(0, heads[0] ?? lines.length)), heads.map((head, n) => trim(lines.slice(head, heads[n + 1])))]
}
const join = (top: string[], lists: string[][]) => [top, ...lists].filter(block => block.length).flatMap(block => [...block, ''])
const nth = (lines: string[], head: number) => lines.slice(0, head).filter(line => LIST.test(line)).length

// moves a sublist, tasks and all, to be the `to`th sublist (0 the first)
export const placeList = (lines: string[], head: number, to: number) => {
  const [top, lists] = blocks(lines)
  lists.splice(to, 0, ...lists.splice(nth(lines, head), 1))

  return join(top, lists)
}

// removes the sublist and keeps its tasks, at the bottom of the top list
export const dropList = (lines: string[], head: number) => {
  const [top, lists] = blocks(lines)
  const [gone] = lists.splice(nth(lines, head), 1)

  return join([...top, ...gone.slice(1).filter(line => line.trim())], lists)
}

// renames a sublist or a task, whichever the line is; the line keeps its bullet, tick or level
export const rename = (lines: string[], at: number, name: string) =>
  lines.map((line, index) => (index === at ? `${/^(#+ |.*?\[[ x]\] )/i.exec(line)?.[1] ?? ''}${name}` : line))

// puts an open task at the end of a list's open tasks, above its done ones
export const file = (lines: string[], head: number, task: string | string[]) => {
  const next = lines.findIndex((other, i) => i > head && LIST.test(other))
  const done = lines.findIndex((other, i) => i > head && (next < 0 || i < next) && isDone(other))

  return done < 0 ? insert(lines, head, task)[0] : [...lines.slice(0, done), ...[task].flat(), ...lines.slice(done)]
}

// Ticks or unticks a task and files it: a done task drops to the bottom of its list,
// a reopened one returns to the end of the open tasks, above the done ones.
export const tick = (lines: string[], index: number) => {
  const [rest, task] = lift(toggle(lines, index), index)
  const head = headOf(lines, index)

  return isDone(task[0]) ? insert(rest, head, task)[0] : file(rest, head, task)
}

// Moves a task to sit just before the line `before`, or to the bottom of the last list when null.
// Dropped just before a heading it ends the list above that heading: an open task ends that list's
// open tasks, above its done ones, which is also where it belongs when the done ones are hidden.
export const drop = (lines: string[], from: number, before: number | null) => {
  const [rest, task] = lift(lines, from)
  const close = (head: number) => (isOpen(task[0]) ? file(rest, head, task) : insert(rest, head, task)[0])
  if (before === null) return close(rest.findLastIndex(other => LIST.test(other)))
  const at = before > from ? before - task.length : before
  if (LIST.test(rest[at])) return close(headOf(rest, at - 1))

  return [...rest.slice(0, at), ...task, ...rest.slice(at)]
}

// The tasks a name points at: the one whose whole name it is, else every one it is part of.
// An agent names a task the way a person would, so one match is an answer and more is a question.
// A sub-item (an indented checkbox line) can be named like any task.
export const match = (lines: string[], name: string) => {
  const want = name.trim().toLowerCase()
  const called = (index: number) => nameOf(lines[index].trim()).toLowerCase()
  const tasks = lines.flatMap((line, index) => (TASK.test(line.trim()) ? [index] : []))
  const whole = tasks.filter(index => called(index) === want)

  return whole.length || !want ? whole : tasks.filter(index => called(index).includes(want))
}

// the heading line of the sublist called `name`, whatever its case; -1 when there is none
export const findList = (lines: string[], name: string) =>
  lines.findIndex(line => LIST.exec(line)?.[1].trim().toLowerCase() === name.trim().toLowerCase())

// breaks a name into lines of at most `room` letters, at spaces where it can
export const wrap = (name: string, room: number) => {
  const out: string[] = []
  for (const word of name.split(' ')) {
    const last = out.at(-1)
    if (last !== undefined && `${last} ${word}`.length <= room) out[out.length - 1] = `${last} ${word}`
    else for (let at = 0; at < Math.max(1, word.length); at += room) out.push(word.slice(at, at + room))
  }

  return out
}

// How many letters fit on the lines of a name in a pane `columns` wide: the first line, which stops
// short of the row's marks, then every line under it. The list has no way to measure text, so
// lines are broken by counting letters. Letters are narrower than the columns they are drawn in
// (ordinary words were measured at 1.36 a column), and the count stays under that so wide ones fit.
// On a terminal (`isGrid`) a letter is exactly a column.
export const rooms = (columns: number, isGrid = false): [number, number] => {
  const across = columns - 5
  // (1.3 let a first line of ordinary words run under the row's icons and lose its last letters)
  const fit = (cols: number) => Math.max(8, Math.floor(cols * (isGrid ? 1 : 1.15)))

  return [fit(across - 6), fit(across)]
}

// A name as lines, each the stretch [start, end) of it that the line holds: broken at a space
// where it can be, and the space a line breaks at belongs to the line before it. The list draws a
// name with this whether it is being read or typed, so its lines break in the same places in both.
export const lay = (text: string, first: number, rest: number) => {
  const lines: [number, number][] = []
  let start = 0
  while (text.length - start > (lines.length ? rest : first)) {
    const room = lines.length ? rest : first
    const space = text.lastIndexOf(' ', start + room)
    const end = space > start ? space + 1 : start + room
    lines.push([start, end])
    start = end
  }
  lines.push([start, text.length])

  return lines
}
