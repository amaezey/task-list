import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { tall } from './list'
import type { Row } from './list'
import { LIST, TASK, bare, shield, addList, addNote, addUnder, drop, dropList, file, findList, headOf, isDone, isOpen, lay, match, nameOf, placeList, remove, removeSub, rename, rooms, setNote, tick, toggle, under } from './tasks'

const PANE = 'task-list'
const FILE = 'TASKS.md'
// The pane, and the width it asks for when docked beside the terminal's transcript: enough for a
// name, a count and the row's marks, so the list fills its column instead of floating in it. (A
// width the person drags the dock to wins; the desktop app and the inline block ignore it.)
const OPEN = { id: PANE, title: 'Tasks', columns: 46 }
// The file says what it is to whoever opens it, person or agent: its first line, written once.
const NOTE = '<!-- Tasks, one per line: "- [ ] to do" or "- [x] done". "## Name" starts a sublist. Indent a task\'s notes under it. The Tasks panel shows this file. -->'
// The one tool agents get. Its description is the whole briefing: what the list is, where it lives
// and that the file may be edited directly, so nothing else has to tell an agent the list exists.
const TOOL = 'mcp__task-list__tasks'
const BRIEF = `The user's task list for this project, which they see in a side panel. It is ${FILE} in the project folder, plain markdown: "- [ ] name" is a task, "- [x] name" a done one, "## Name" starts a sublist, and lines indented under a task are its notes and sub-items. Use this tool to show the list, to add, finish, reopen or remove a task, or to add a note to one, and when the user asks you to remember something they need to do. For anything else (rename, move, reorder, delete a sublist) edit the file. Every call returns the list as it now stands.`
const INPUT = {
  type: 'object',
  properties: {
    action: { enum: ['show', 'add', 'done', 'reopen', 'remove', 'note'], description: 'What to do. "remove" takes a task with its notes and sub-items.' },
    task: {
      type: 'string',
      description: 'For add: the new task. For done, reopen, remove and note: the name of the task or sub-item, or enough of it to mean only one.',
    },
    under: { type: 'string', description: 'For add: the name of an existing task to put this under, as a sub-item of it.' },
    note: { type: 'string', description: 'For note: text to add under the task, after any notes it has; empty takes its notes away. For add: a note to put under the new task.' },
    list: { type: 'string', description: 'For add: the sublist to put it in, whatever its case, created if it is not there. Leave out for no sublist.' },
  },
  required: ['action'],
} as const
// TASKS.md in the project folder is the source of truth; this mirrors it so the pane redraws
const text = atom({ plugin: 'task-list', key: 'text' } as const, '')
// the line of the task or sublist whose name is being edited in place
const editing = atom({ plugin: 'task-list', key: 'editing' } as const, null)
// the line of the task whose every line shows: the rest of a long name, and its notes
const expanded = atom({ plugin: 'task-list', key: 'expanded' } as const, null)
// the fixed heading over the tasks in no sublist, shown once there is a sublist to tell them from
const TOP = 'General'
// the pane's width in columns, as the list reports it: names are laid out in lines to fit it
const wide = atom({ plugin: 'task-list', key: 'wide' } as const, 0)
// how many rows the list has asked for under the open field, to write a long name out whole
const liveRows = atom({ plugin: 'task-list', key: 'liveRows' } as const, 0)
// The clipboard as last read for the list. The list does its own typing and may not read the
// clipboard, so on cmd+v it asks here, where a command can be run; `n` tells one read from the next.
const clip = atom({ plugin: 'task-list', key: 'clip' } as const, { n: 0, text: '' })
// where a new name is being typed: a sublist's heading line, -1 for the tasks in no sublist, or
// 'list' for a new sublist
const adding = atom({ plugin: 'task-list', key: 'adding' } as const, null)
// Whether done tasks are left out of the pane. It is how the person likes to look at the list, not
// part of the list, so it is kept in the mod's own store and TASKS.md never hears of it.
const hideDone = atom({ plugin: 'task-list', key: 'hideDone' } as const, false)
// what is in the terminal's own field as it is typed (the terminal only: the list does not hear keys there)
const draft = atom({ plugin: 'task-list', key: 'draft' } as const, '')
// which field that is: the terminal keeps a field's text under its key, so each new one takes a new key
const field = atom({ plugin: 'task-list', key: 'field' } as const, 0)

const load = async $ => {
  // Only a file that is not there is an empty list. A read that fails for any other reason must
  // stop here: carrying on as if the list were empty would have the next save wipe it.
  // (a file saved with Windows line ends is read as any other; it is saved back without them)
  const file = (await $.fs.exists(FILE)) ? shield((await $.fs.read(FILE)).replace(/\r\n/g, '\n')) : ''
  // an unchanged file must not redraw the pane: a redraw between press and release loses the click
  if ((await read($, text)) !== file) await update($, text, () => file)

  return file
}
const save = async ($, lines: string[]) => {
  const isNoted = lines.some(line => line.startsWith('<!-- Tasks'))
  const file = (isNoted ? lines : [NOTE, '', ...lines]).join('\n')
  await $.fs.write(FILE, bare(file))
  await update($, text, () => file)
  // the first line, written in, moves every line under it down two: what is open moves with its line
  if (!isNoted) {
    const down = (now: unknown) => (typeof now === 'number' && now >= 0 ? now + 2 : now) as never
    await update($, expanded, down)
    await update($, editing, down)
    await update($, adding, down)
  }
}
// Re-reads the file, then applies one change to the task or sublist on `line`. `label` is its name
// as the pane drew it: a file that changed under the pane redraws instead of changing the wrong one.
const change = async ($, line: number, label: string, apply: (lines: string[]) => string[]) => {
  const fresh = (await load($)).split('\n')
  await update($, editing, () => null)
  await update($, expanded, () => null)
  if (label !== undefined && nameOf(fresh[line]) === label) await save($, apply(fresh))
}
const add = async ($, apply: (lines: string[]) => string[]) => save($, apply((await load($)).split('\n')))
// keeps the name typed in the terminal's field: as the new name of what is being renamed, or as a
// new task or sublist where one was being added. An empty name keeps nothing.
const commit = async ($, typed: string) => {
  const name = typed.replace(/\s+/g, ' ').trim()
  const renaming = await read($, editing)
  const open = await read($, adding)
  const mirror = (await read($, text)).split('\n')
  await update($, draft, () => '')
  await update($, editing, () => null)
  await update($, adding, () => null)
  if (!name) return
  if (renaming !== null) await change($, renaming, nameOf(mirror[renaming]), lines => rename(lines, renaming, name))
  else if (open === 'list') await add($, fresh => addList(fresh, name))
  else if (typeof open === 'number') {
    const put = (fresh: string[]) => file(fresh, open, `- [ ] ${name}`)
    await (open < 0 ? add($, put) : change($, open, nameOf(mirror[open]), put))
  }
}

// The tool's answer: what happened in a sentence, then the list. A name that fits no task, or more
// than one, changes nothing and says so beside the list, which is all an agent needs to try again.
const answer = async ($, input: { action?: string; task?: string; list?: string; note?: string; under?: string }) => {
  const fresh = (await load($)).split('\n')
  // a name is one line, whatever was sent: a line break in one would write lines of its own into the file
  const task = (input.task ?? '').replace(/\s+/g, ' ').trim()
  const list = (input.list ?? '').replace(/\s+/g, ' ').trim()
  const say = (what: string, lines: string[]) => ({ result: `${what}\n\n${FILE}:\n${bare(lines.join('\n')).trim() || '(empty)'}` })
  const done = async (what: string, lines: string[]) => {
    await save($, lines)

    return say(what, (await read($, text)).split('\n'))
  }
  if (input.action === 'show' || !input.action) return say('The task list.', fresh)
  if (!task) return say(`Nothing changed: "${input.action}" needs a task.`, fresh)
  if (input.action === 'add' && input.under?.trim()) {
    // a sub-item goes under a task of the list itself, not under another sub-item
    const over = match(fresh, input.under).filter(index => TASK.test(fresh[index]))
    if (over.length !== 1) return say(over.length ? `Nothing changed: "${input.under}" fits ${over.length} tasks. Use more of its name.` : `Nothing changed: no task is called "${input.under}".`, fresh)

    return done(`Added "${task}" under "${nameOf(fresh[over[0]])}".`, addUnder(fresh, over[0], task))
  }
  if (input.action === 'add') {
    const isTop = !list || list.toLowerCase() === TOP.toLowerCase()
    const lines = isTop || findList(fresh, list) >= 0 ? fresh : addList(fresh, list)

    // the new task, with its note under it if it was given one
    const head = isTop ? -1 : findList(lines, list)
    const added = file(lines, head, `- [ ] ${task}`)
    // (the line that was put in, which is the first that differs: another task may have the same name)
    const at = added.findIndex((line, index) => line !== lines[index])

    return done(`Added "${task}"${isTop ? '' : ` to ${list}`}.`, input.note?.trim() ? setNote(added, at, input.note) : added)
  }
  const found = match(fresh, task)
  if (found.length !== 1)
    return say(found.length ? `Nothing changed: "${task}" fits ${found.length} tasks. Use more of its name.` : `Nothing changed: no task is called "${task}".`, fresh)
  const [at] = found
  // a sub-item is one indented line: it is ticked, or taken out, where it stands
  const isSub = !TASK.test(fresh[at])
  const row = fresh[at].trim()
  const name = nameOf(row)
  const flip = isSub ? toggle : tick
  if (input.action === 'remove') return done(`Removed "${name}".`, isSub ? removeSub(fresh, at) : remove(fresh, at))
  if (input.action === 'note' && isSub) return say(`Nothing changed: "${name}" is a sub-item, and a note goes on a task.`, fresh)
  if (input.action === 'note') return input.note?.trim() ? done(`Noted under "${name}".`, addNote(fresh, at, input.note)) : done(`Took the notes off "${name}".`, setNote(fresh, at, ''))
  if (input.action === 'done') return isDone(row) ? say(`"${name}" was already done.`, fresh) : done(`Done: "${name}".`, flip(fresh, at))
  if (input.action === 'reopen') return isOpen(row) ? say(`"${name}" was already open.`, fresh) : done(`Reopened "${name}".`, flip(fresh, at))

  return say(`Nothing changed: "${input.action}" is not show, add, done, reopen, remove or note.`, fresh)
}


// The arrow that opens a task out: one drawing, turned. Two characters never match as a pair,
// since each is drawn by whichever font on the machine happens to hold it.
// The marks at a row's right edge are drawings, not characters: a character is drawn by whichever
// font on the machine happens to hold it, at the pane's one text size, so characters neither match
// one another nor can be made larger. Each drawing is one stroke weight and one grey.
// Under the pointer a drawing goes to the text colour, as a circle or a grip does. The mod is not
// told the theme, so the drawing asks for itself: dark ink, or light ink where the scheme is dark.
// (The blue on the drawing itself is what shows should a surface drop the style.)
const INK = '<style>*{stroke:#1f1f1f}@media (prefers-color-scheme:dark){*{stroke:#f2f2f2}}</style>'
const drawn = (size: number, path: string) => (isLit: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${isLit ? '#4a90d9' : '#888'}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${isLit ? INK : ''}${path}</svg>`
const BIN = drawn(15, '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>')
const PENCIL = drawn(15, '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>')
const PLUS = drawn(15, '<path d="M5 12h14"/><path d="M12 5v14"/>')
const CROSS = drawn(15, '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>')
// the arrow that opens a task out: one drawing, turned to point right or down
const ARROW = (turn: number) => drawn(15, `<path transform="rotate(${turn} 12 12)" d="m9 18 6-6-6-6"/>`)
// which icon the pointer is on, as the list reports it: "row:part"
const hotIcon = atom({ plugin: 'task-list', key: 'hotIcon' } as const, '')

export const register: Register = on => {
  // What the person did in the list. The list is one Client: it draws every row, the typing field
  // included, and posts each act here, where the file is.
  on('ui.message', async ($, e, next) => {
    const did = e.data as { act: string; line?: number; before?: number | null; to?: number; name?: string; was?: string; isCancel?: boolean }
    if (typeof did?.act !== 'string') return next(e)
    const line = did.line ?? -1
    // The name the person saw on this line: what the list says it drew there, else what the mirror
    // holds. A change goes ahead only if the file still has that name on that line.
    const label = did.was ?? nameOf((await read($, text)).split('\n')[line])
    const name = (did.name ?? '').trim()
    const put = (fresh: string[]) => file(fresh, line, `- [ ] ${name}`)
    // On a terminal the list never hears the keys: a name is typed in the terminal's own field, laid
    // over the row, and the pane asks for the keyboard so the field has it. (The terminal grants that
    // only while the prompt is empty.)
    if (e.surface === 'terminal' && (did.act === 'add' || did.act === 'addList' || did.act === 'edit')) {
      await update($, draft, () => '')
      await update($, field, now => now + 1)
      void $.ui.open({ ...OPEN, focus: true }).catch(() => {})
    }
    if (did.act === 'tick') await change($, line, label, lines => tick(lines, line))
    else if (did.act === 'drop') await change($, line, label, lines => drop(lines, line, did.before ?? null))
    else if (did.act === 'place') await change($, line, label, lines => placeList(lines, line, did.to ?? 0))
    else if (did.act === 'remove') await change($, line, label, lines => (LIST.test(lines[line]) ? dropList(lines, line) : remove(lines, line)))
    else if (did.act === 'rename' && name) await change($, line, label, lines => rename(lines, line, name))
    // the fixed heading is no line of the file, so there is nothing of it to have changed
    else if (did.act === 'create' && name) await (line < 0 ? add($, put) : change($, line, label, put))
    else if (did.act === 'createList' && name) {
      await add($, fresh => addList(fresh, name))
      await update($, adding, () => null)
    } else if (did.act === 'paste') {
      // macOS: `pbpaste` prints the clipboard. Where it is missing, nothing is pasted.
      const read = await $.process.run(['pbpaste']).catch(() => null)
      if (read?.exitCode === 0) await update($, clip, now => ({ n: now.n + 1, text: read.stdout }))
    } else if (did.act === 'copy' && name) await $.ui.copy({ text: name, surface: e.surface })
    else if (did.act === 'tickSub') {
      // a sub-item is ticked where it stands, and its task stays opened out
      const fresh = (await load($)).split('\n')
      if (/^\s/.test(fresh[line] ?? '') && nameOf((fresh[line] ?? '').trim()) === did.was) await save($, toggle(fresh, line))
    } else if (did.act === 'shut') {
      await update($, expanded, () => null)
    }
    else if (did.act === 'hide') {
      const now = !(await read($, hideDone))
      // a done task that was open, or being typed over, is about to leave the pane
      await update($, editing, () => null)
      await update($, expanded, () => null)
      await update($, hideDone, () => now)
      await $.store.set('hideDone', now).catch(() => {})
    }
    else if (did.act === 'hot') await update($, hotIcon, () => did.name ?? '')
    else if (did.act === 'wide') await update($, wide, () => Math.max(0, (did as { n?: number }).n ?? 0))
    else if (did.act === 'rows') await update($, liveRows, () => Math.max(0, Math.min(20, (did as { n?: number }).n ?? 0)))
    else if (did.act === 'more') await update($, expanded, now => (now === line ? null : line))
    else if (did.act === 'edit' && line >= 0) {
      await update($, adding, () => null)
      // typing somewhere else shuts a task that was opened out; typing over its own name does not
      await update($, expanded, now => (now === line ? now : null))
      // The rows the name will be written over are there from the first drawing of the field, as many
      // as the list would ask for: had it to ask, the name's further lines would go and come back.
      const name = nameOf((await read($, text)).split('\n')[line]) ?? ''
      const spare = e.surface === 'terminal' ? 0 : lay(name, ...rooms((await read($, wide)) || 40)).length - 1
      await update($, liveRows, () => Math.max(0, Math.min(20, spare)))
      await update($, editing, () => line)
    } else if (did.act === 'add' || did.act === 'addList') {
      await update($, expanded, () => null)
      await update($, editing, () => null)
      await update($, liveRows, () => 0)
      await update($, adding, now => (did.act === 'addList' ? 'list' : now === line ? null : line))
    } else if (did.act === 'close' && e.surface === 'terminal' && !did.isCancel && (await read($, draft)).trim()) {
      // a click away from the terminal's field keeps what was typed in it, as it does on the desktop
      await commit($, await read($, draft))
    } else if (did.act === 'close') {
      await update($, editing, () => null)
      await update($, adding, () => null)
      await update($, draft, () => '')
    }

    return next(e)
  })

  // the terminal's own field: each edit is kept as it is typed, and Enter keeps the name
  on('ui.input', async ($, e, next) => {
    if (!e.element.startsWith('tl-name')) return next(e)
    if (e.kind === 'submit') await commit($, e.value ?? '')
    else await update($, draft, () => e.value ?? '')

    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'task',
      description: 'Add a task to TASKS.md, or open the task list with no text',
    })
    await $.tool.register({ name: 'tasks', description: BRIEF, inputSchema: INPUT })
    // a list that cannot be read, or a store that cannot, must not stop the session starting
    await load($).catch(() => {})
    const isHidden = (await $.store.get('hideDone').catch(() => false)) === true
    await update($, hideDone, () => isHidden)
    // The pane opens by itself only in a folder that has a task list. Anywhere else it waits for
    // /task, so a session about something else is not handed an empty panel.
    if (await $.fs.exists(FILE).catch(() => false)) void $.ui.open(OPEN).catch(() => {})

    return next(e)
  })

  on('command.run', { command: 'task' }, async ($, e) => {
    await $.ui.open(OPEN)
    const task = e.args.trim()
    if (!task) {
      await load($)

      return { text: 'Task list opened.' }
    }
    await add($, lines => file(lines, -1, `- [ ] ${task}`))

    return { text: `Added: ${task}` }
  })

  // picks up edits made to TASKS.md by hand or by Claude
  on('tool.call', async ($, e, next) => {
    // a list that cannot be read is said so: an agent told nothing would take the list for empty
    if (e.tool === TOOL) return answer($, e as never).catch((fault: Error) => ({ result: `Nothing changed: ${FILE} could not be read or saved (${fault.message}).` }))
    const ran = await next(e)
    // another tool's result is its own, whatever becomes of this re-read
    await load($).catch(() => {})

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const lines = (await read($, text)).split('\n')
    const renaming = await read($, editing)
    const open = await read($, adding)
    const whole = await read($, expanded)
    const isHiding = await read($, hideDone)
    const isGrid = e.surface === 'terminal'
    const spare = await read($, liveRows)
    // the rows under an open field that the list writes a long name out on
    const liveUnder = (line: number): Row[] => Array.from({ length: spare }, () => ({ kind: 'more', line, label: '', isDone: false, note: '', isLive: true }))
    // a name's lines in a pane this wide: the same breaks the list uses when the name is typed
    const columns = (await read($, wide)) || e.props.bodyColumns || 40
    const [first, rest] = rooms(columns, isGrid)
    const linesOf = (name: string) => lay(name, first, rest).map(([start, end]) => name.slice(start, end).trimEnd())
    const heads = lines.flatMap((line, index) => (LIST.test(line) ? [index] : []))
    const todo = (head: number) =>
      lines.slice(head + 1, heads.find(other => other > head) ?? lines.length).filter(isOpen).length
    // the last task of a sublist; the heading itself when it has none
    const tail = (head: number) => lines.findLastIndex((line, index) => index === head || (headOf(lines, index) === head && TASK.test(line)))

    // the pane top to bottom, a row each: the list draws exactly these
    const rows: Row[] = []
    const blank = (kind: Row['kind'], line = -1): Row => ({ kind, line, label: '', isDone: false, note: '' })
    // the row a new task is typed in closes the list it will join
    const newIn = (head: number) => open === head && rows.push(blank('new', head), ...liveUnder(head))
    if (heads.length) {
      const loose = lines.slice(0, heads[0]).filter(line => TASK.test(line)).length
      rows.push({ kind: 'top', line: -1, label: TOP, isDone: !todo(-1), note: todo(-1) ? `${todo(-1)} to do` : loose ? 'all done' : '' })
    }
    let head = -1
    lines.forEach((line, index) => {
      const task = TASK.exec(line)
      const list = LIST.exec(line)
      const isTyping = renaming === index
      if (list) {
        newIn(head)
        head = index
        if (rows.length) rows.push(blank('gap', index))
        const count = todo(index)
        // an empty sublist has nothing done in it
        const isEmpty = tail(index) === index
        rows.push({ kind: 'list', line: index, label: list[1], name: list[1], isDone: !count && !isEmpty, note: count ? `${count} to do` : isEmpty ? '' : 'all done', isTyping })
        if (isTyping) rows.push(...liveUnder(index))
      } else if (task) {
        const isDone = task[1] !== ' '
        if (isDone && isHiding && !isTyping) return
        const [top, ...more] = linesOf(task[2])
        // What is under the task: a sub-item is a row of its own that can be ticked, a note is as many
        // rows of text as it needs. Both stand in from the task's name.
        const notes: Row[] = under(lines, index).flatMap(one =>
          one.item
            ? [{ kind: 'sub' as const, line: one.line, label: one.text, isDone: one.isDone, note: '' }]
            : lay(one.text, rest - 3, rest - 3).map(([start, end]) => ({ kind: 'more' as const, line: index, label: one.text.slice(start, end).trimEnd(), isDone, note: '', isNote: true })),
        )
        // one arrow for "there is more to this task", whether that is the rest of a long name or its notes
        const note = more.length || notes.length ? 'more' : ''
        // At rest a row holds the whole name and the list cuts it at the row's edge. Opened out, it
        // holds the name's first line, and the lines after it follow on rows of their own.
        const isOut = whole === index && !isTyping
        rows.push({ kind: 'task', line: index, label: isOut ? top : task[2], name: task[2], isDone, note, isOpen: isOut, isTyping })
        // while a name is typed its notes stay in view under it, if the task was opened out
        if (isTyping) rows.push(...liveUnder(index), ...(whole === index ? notes : []))
        if (isOut)
          rows.push(
            ...more.map(label => ({ kind: 'more' as const, line: index, label, isDone, note })),
            ...notes,
          )
      }
    })
    newIn(head)
    // a new sublist is typed where the foot stood, so a second click on the same spot lands in it
    if (open === 'list') rows.push(...(rows.length ? [blank('gap')] : []), blank('newlist'), ...liveUnder(-1))
    const isEmpty = !rows.length
    // The foot: a row that starts a sublist, with the words that hide what is done at its right end
    // (only where something is done), and under it a row that starts a task in General.
    const finished = lines.filter(line => isDone(line)).length
    rows.push(
      ...(rows.length && open !== 'list' ? [blank('gap')] : []),
      { ...blank('foot'), label: 'list', note: !finished ? '' : isHiding ? `Show ${finished} done` : 'Hide done' },
      { ...blank('foot'), label: 'task' },
    )

    // An icon is a picture laid on row `at` (placed against that row's own box), in a slot the list leaves clear there: the list cannot
    // draw one. `side` counts columns from the pane's right edge, or from its left when negative
    // (-1 is column 0). `sign` stands in where a surface has no drawings. A picture cannot be pressed
    // and takes any click that lands on it, so every icon lies under the list, which is drawn over
    // them and is clear where it has left a slot: the click, and the light under the pointer, are
    // the list's. (A button over the picture works too, but pressing one takes the keyboard from
    // the list, which then cannot hear what is typed.)
    const lit = await read($, hotIcon)
    const icon = (at: number, side: number, drawing: (isLit: boolean) => string, sign: string, alt: string, part: string, across = 3) => (
      <Box position="absolute" top={0} {...(side < 0 ? { left: -side - 1 } : { right: side })} width={across} height={1} flexDirection="row" justifyContent="center" alignItems="center">
        {/* the terminal's table answers for `Svg` and draws nothing, so the surface is asked, not the table */}
        {e.surface !== 'terminal' && 'Svg' in table ? <table.Svg source={drawing(lit === `${at}:${part}`)} alt={alt} /> : <Text dimColor={lit !== `${at}:${part}`}>{sign}</Text>}
      </Box>
    )
    const icons = rows.map((row, at) => {
      // a terminal draws over what is under: there the list writes each sign in its own slot
      if (isGrid) return []
      // a heading's plus starts a task under it
      if (row.kind === 'top' || (row.kind === 'list' && !row.isTyping)) return [icon(at, 0, PLUS, '+', 'Add a task', 'plus')]
      // the row a name is typed in: the bin (a name that exists), and the cross that closes it unkept
      if (row.isTyping || row.kind === 'new' || row.kind === 'newlist')
        return [...(row.isTyping ? [icon(at, 3, BIN, '-', 'Delete', 'bin')] : []), icon(at, 0, CROSS, '×', 'Close', 'close')]
      // the foot row's starts, each behind a plus
      if (row.kind === 'foot') return [icon(at, -2, PLUS, '+', row.label === 'task' ? 'New task' : 'New list', row.label)]
      if (row.kind !== 'task') return []
      // an opened-out task has its pencil where the bin stands once the name is open; a task with more to show has its arrow
      const pencil = row.isOpen ? [icon(at, 3, PENCIL, '✎', 'Edit', 'pencil')] : []
      const arrow = row.note !== '' ? [icon(at, 0, ARROW(row.isOpen ? 90 : 0), row.isOpen ? 'v' : '>', row.isOpen ? 'Close' : 'Open', 'arrow')] : []

      return [...pencil, ...arrow]
    })

    // The list's rows stand at different heights, and the pictures are laid under it row for row:
    // a box for each row, as tall as the list draws that row, with the row's pictures on its first line.
    const sizes = tall(rows, isGrid)
    const typingAt = rows.findIndex(row => row.isTyping || row.kind === 'new' || row.kind === 'newlist')
    const total = sizes.reduce((sum, size) => sum + size.height, 0)
    // the list is drawn down to the bottom of the pane, so that a click on the empty part of the pane is a click in the list
    const down = Math.max(total, Math.max(e.viewport?.rows ?? 0, e.props.scroll?.bodyRows ?? 0) - 3)

    return (
      // (a terminal pane has its own top row, with its close mark, so the list starts right under it there)
      <Box flexDirection="column" paddingTop={isGrid ? 0 : 1} paddingBottom={2}>
        {isEmpty && <Text dimColor>Nothing to do yet.</Text>}
        <Box flexDirection="column" height={down}>
          {rows.map((_, at) => (
            <Box flexDirection="column" height={sizes[at].height} paddingTop={sizes[at].top} flexShrink={0}>
              <Box height={1}>{icons[at]}</Box>
            </Box>
          ))}
          <Box position="absolute" top={0} left={0} right={0} height={down}>
            {'Client' in table && (
              <table.Client
                key="list-0"
                module="./list.tsx"
                width="100%"
                height={down}
                props={{ rows, paste: await read($, clip), wide: await read($, wide), hasKeys: e.props.isFocused === true, isGrid }}
              />
            )}
          </Box>
          {/* On a terminal a name is typed in the terminal's own field, laid over its row where the
              name stands (a task's past its circle, a sublist's past its grip) and short of the row's
              two right-hand slots. */}
          {isGrid && typingAt >= 0 && 'Input' in table && (
            <Box position="absolute" top={sizes.slice(0, typingAt).reduce((sum, size) => sum + size.height, 0)} left={rows[typingAt].kind === 'list' || rows[typingAt].kind === 'newlist' ? 2 : 5} right={6} height={1}>
              <table.Input
                key={`tl-name-${await read($, field)}`}
                autoFocus
                value={rows[typingAt].isTyping ? (rows[typingAt].name ?? '') : ''}
                placeholder={rows[typingAt].kind === 'newlist' ? 'New list' : 'New task'}
                onSubmit={() => {}}
              />
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
