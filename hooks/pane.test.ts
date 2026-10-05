import { expect, test } from 'claude-code/testing'

// The pane is one list. Its parts are boxes of fixed width, so a click's column says which part it
// hit: 0-1 the grip, 2-3 the circle, then the name, and the last three columns the row's mark.
const PANE = { plugin: 'task-list', component: 'Pane', requestId: 'task-list', props: { bodyColumns: 60 } } as const
const WIDE = 40
const EDGE = WIDE - 2

// the engine a test stands for: a file that follows each save, and the calls a session answers
const world = (on: Parameters<Parameters<typeof test>[1]>[1], start: string) => {
  const state = { file: start, saves: 0, store: {} as Record<string, unknown> }
  on('store.get', async (_$, e) => ({ value: state.store[(e as { key: string }).key] }))
  on('store.set', async (_$, e) => {
    state.store[(e as { key: string }).key] = (e as { value: unknown }).value

    return { value: undefined }
  })
  on('fs.exists', async () => ({ value: true }))
  on('fs.read', async () => ({ value: state.file }))
  on('fs.write', async (_$, e) => {
    state.file = (e as { text: string }).text
    state.saves++

    return { value: undefined }
  })
  on('ui.open', async () => ({ value: undefined }))
  on('command.register', async () => ({ value: undefined }))
  on('tool.register', async () => ({ value: { tool: 'mcp__task-list__tasks' } }))
  on('process.run', async () => ({ value: { exitCode: 0, stdout: 'pasted words', stderr: '' } }))
  on('ui.copy', async () => ({ value: { isCopied: true } }))

  return state
}

for (const surface of ['terminal', 'desktop'] as const)
  test(`the list draws, clicks, types and drags on ${surface}`, async ($, on) => {
    // rows: 0 General, 1 sandwich…, 2 done one, 3 gap, 4 test, 5 test 1, 6 gap, 7 foot
    const state = world(on, '- [ ] sandwich with a very long name that runs well past the edge of a narrow panel\n- [x] done one\n\n## test\n- [ ] test 1\n')
    await $.command.run({ command: 'task', args: '' })
    const pane = await $.ui.mount({ ...PANE, surface })
    await pane.resize({ columns: WIDE, rows: 8, in: 'list-0' })
    const list = async () => JSON.stringify(await pane.drawn({ in: 'list-0' }))
    const rows = async () => ((await pane.drawn({ in: 'list-0' })) as { children: unknown[] }).children.length
    // Rows stand at different heights, and the pointer reports rows of the grid: `cell` is the grid
    // row that falls on the text of the list's row `row`, read off what the list drew.
    const cell = async (row: number) => {
      const kids = ((await pane.drawn({ in: 'list-0' })) as { children: { props: { height: number; paddingTop?: number } }[] }).children
      const off = kids.slice(0, row).reduce((sum, kid) => sum + kid.props.height, 0)

      return Math.max(0, Math.ceil(off + (kids[row].props.paddingTop ?? 0) - 0.5))
    }
    const click = async (x: number, row: number) => {
      const y = await cell(row)
      for (const type of ['down', 'up'] as const) await pane.pointer({ type, x, y, button: 'left', in: 'list-0' })
    }
    // a click on the empty part of the pane, under the last row
    const away = async () => {
      for (const type of ['down', 'up'] as const) await pane.pointer({ type, x: 8, y: 200, button: 'left', in: 'list-0' })
    }
    // typing is the list's own: it hears each key and draws the name
    const key = (k: string, mods: object = {}) => pane.key({ key: k, in: 'list-0', ...mods })
    const type = async (words: string) => {
      for (const letter of words) await key(letter === ' ' ? 'space' : letter)
    }
    // a task's name opens it out, and the pencil that then shows opens the name for typing
    // (the pencil is in the second slot from the right; a click there is the list's own)
    const isOut = async () => /"alt":"Edit"|✎/.test(JSON.stringify(await pane.drawn()) + (await list()))
    const openEdit = async (y: number) => {
      if (!(await isOut())) await click(8, y)
      await click(WIDE - 5, y)
    }
    // (the cursor: a bar between two letters, or on a terminal the one letter it stands before, reversed out)
    const typing = async () => (surface === 'terminal' ? /"inverse":true\},"children":\[".?"\]/ : /"width":0[^\]]*\["\|"\]/).test(await list())
    expect(await list()).toMatch(/General.*1 to do.*sandwich.*done one.*test.*1 to do.*test 1.*New list.*Hide done/)
    // with a sublist in the file every heading has its plus, and the foot starts sublists only
    expect(await list()).not.toContain('New task')
    expect(await rows()).toBe(8)
    // a terminal has whole rows only and no pictures: every row is one tall, and the list writes its own signs
    const heights = ((await pane.drawn({ in: 'list-0' })) as { children: { props: { height: number } }[] }).children.map(kid => kid.props.height)
    expect(heights.every(Number.isInteger)).toBe(surface === 'terminal')
    expect(/" \+"/.test(await list())).toBe(surface === 'terminal')
    // the words at the foot's right end hide the done tasks and show them again, and the choice is kept
    await click(WIDE - 4, 7)
    expect(await list()).not.toContain('done one')
    expect(await list()).toContain('Show 1 done')
    expect(state.store.hideDone).toBe(true)
    await click(WIDE - 4, 6)
    expect(await list()).toContain('done one')

    // the part under the pointer lights, and only that part: a name comes up from grey to the text colour, and so does a circle
    await pane.pointer({ type: 'move', x: 8, y: await cell(1), in: 'list-0' })
    expect(await list()).toMatch(/"dimColor":false[^}]*\},"children":\["sandwich/)
    await pane.pointer({ type: 'move', x: 2, y: await cell(1), in: 'list-0' })
    expect(await list()).toMatch(/"dimColor":true[^}]*\},"children":\["sandwich/)
    expect(await list()).toMatch(/\{"type":"Text","children":\["○"\]\}/)
    await pane.pointer({ type: 'leave', x: 2, y: await cell(1), in: 'list-0' })
    expect(await list()).not.toMatch(/\{"type":"Text","children":\["○"\]\}/)

    // an icon under the pointer is drawn again in the text colour, and goes back when the pointer leaves
    const inked = async () => JSON.stringify(await pane.drawn()).split('prefers-color-scheme').length - 1
    expect(await inked()).toBe(0)
    await pane.pointer({ type: 'move', x: EDGE, y: await cell(4), in: 'list-0' })
    // (the terminal has no drawings: its icons are characters, and go from dim to plain)
    expect(await inked()).toBe(surface === 'desktop' ? 1 : 0)
    await pane.pointer({ type: 'move', x: 8, y: await cell(4), in: 'list-0' })
    expect(await inked()).toBe(0)
    // a long name's mark opens it out over further rows, and closes it again
    await click(EDGE, 1)
    expect(await rows()).toBeGreaterThan(8)
    await click(EDGE, 1)
    expect(await rows()).toBe(8)

    // the circle ticks, and a done task drops under the open ones
    await click(2, 1)
    expect(state.file).toMatch(/\[x\] done one\n- \[x\] sandwich/)

    // a press on a name carried away drags nothing; a press on its grip does, and the rows show it on the way
    await pane.pointer({ type: 'down', x: 8, y: await cell(2), button: 'left', in: 'list-0' })
    await pane.pointer({ type: 'move', x: 8, y: await cell(5), button: 'left', in: 'list-0' })
    expect(await list()).toMatch(/done one.*sandwich.*test 1/)
    await pane.pointer({ type: 'down', x: 0, y: await cell(2), button: 'left', in: 'list-0' })
    await pane.pointer({ type: 'move', x: 0, y: await cell(5), button: 'left', in: 'list-0' })
    expect(await list()).toMatch(/done one.*test 1.*sandwich/)
    await pane.pointer({ type: 'up', x: 0, y: await cell(5), button: 'left', in: 'list-0' })
    expect(state.file).toMatch(/done one\n\n## test\n- \[ \] test 1\n- \[x\] sandwich/)

    // rows now: 0 General, 1 done one, 2 gap, 3 test, 4 test 1, 5 sandwich, 6 gap, 7 foot
    if (surface === 'terminal') {
      // The list never hears keys on a terminal: a sublist's + lays the terminal's own field over the
      // new row, and Enter keeps the name.
      // (each field has a key of its own, read off the drawing)
      const fieldKey = async () => /"key":"(tl-name-\d+)"/.exec(JSON.stringify(await pane.drawn()))?.[1] ?? ''
      await click(EDGE, 3)
      expect(JSON.stringify(await pane.drawn())).toContain('tl-name-')
      await pane.input({ key: await fieldKey(), text: 'milk' })
      expect(state.file).toMatch(/## test\n- \[ \] test 1\n- \[ \] milk\n/)
      // what is typed and then clicked away from is kept, as on the desktop
      await click(EDGE, 3)
      await pane.input({ key: await fieldKey(), text: 'eggs', kind: 'change' })
      await away()
      expect(state.file).toMatch(/- \[ \] milk\n- \[ \] eggs\n/)
      // the cross closes it unkept
      await click(EDGE, 3)
      await pane.input({ key: await fieldKey(), text: 'thrown away', kind: 'change' })
      // (the new row closes the list, under its done task: the third row from the bottom)
      await click(EDGE, (await rows()) - 3)
      expect(state.file).not.toMatch(/thrown away/)
      // the foot starts a new sublist the same way
      await click(2, (await rows()) - 1)
      await pane.input({ key: await fieldKey(), text: 'Later' })
      expect(state.file).toMatch(/## Later\n$/)

      return
    }
    // a sublist's + opens a row to type in, in the list itself; Enter adds and the row stays for the next
    await click(EDGE, 3)
    expect(await list()).toContain('New task')
    expect(await typing()).toBe(true)
    await type('milk')
    await key('return')
    expect(state.file).toMatch(/## test\n- \[ \] test 1\n- \[ \] milk\n- \[x\] sandwich/)
    expect(await typing()).toBe(true)
    // a click elsewhere with nothing typed closes it and does nothing else
    await click(8, 1)
    expect(await typing()).toBe(false)

    // a name is typed over in its own row: the cursor starts at its end, arrows move it, paste and undo work
    await openEdit(1)
    expect(await typing()).toBe(true)
    await type(' x')
    await key('left')
    await key('left')
    await type('!')
    expect(await list()).toMatch(/done one!/)
    await key('v', { meta: true })
    expect(await list()).toMatch(/done one!pasted words/)
    await key('z', { meta: true })
    expect(await list()).not.toMatch(/pasted words/)
    // dragging across the name selects it, and typing replaces what is selected
    await pane.pointer({ type: 'down', x: 5, y: await cell(1), button: 'left', in: 'list-0' })
    await pane.pointer({ type: 'move', x: 30, y: await cell(1), button: 'left', in: 'list-0' })
    await pane.pointer({ type: 'up', x: 30, y: await cell(1), button: 'left', in: 'list-0' })
    expect(await list()).toMatch(/"inverse":true/)
    expect(await typing()).toBe(false)
    await type('swapped')
    expect(await list()).toMatch(/"swapped"/)
    await key('z', { meta: true })
    // select all, then type over it; clicking away keeps it, and that click does no more
    await key('a', { meta: true })
    await type('renamed')
    const saves = state.saves
    await click(2, 4)
    expect(state.file).toMatch(/- \[x\] renamed\n/)
    expect(state.saves).toBe(saves + 1)
    // a long name takes the rows it needs, as it is typed, and gives them back
    await openEdit(1)
    const before = await rows()
    await type(' and a much longer name than one row of this pane can hold')
    expect(await rows()).toBeGreaterThan(before)
    await key('z', { meta: true })
    for (let n = 0; n < 60; n++) await key('z', { meta: true })
    expect(await rows()).toBe(before)
    // a click on the empty part of the pane is a click away too (the name is still open here, its cursor at the end)
    await key('end')
    await type('!')
    await away()
    expect(await typing()).toBe(false)
    expect(state.file).toMatch(/- \[x\] renamed!\n/)
    await openEdit(1)
    await key('backspace')
    await key('return')
    expect(state.file).toMatch(/- \[x\] renamed\n/)
    // the pane giving up the keyboard, as a click outside it does, keeps the name too, and draws on without fault
    await openEdit(1)
    await pane.redraw({ ...PANE.props, isFocused: true } as never)
    await type('?')
    // (a long name, so that it has rows of its own under it when the keyboard goes)
    await type(' and enough more words after it that the name runs on to a second row of the pane')
    await pane.redraw({ ...PANE.props, isFocused: false } as never)
    await list()
    expect(state.file).toMatch(/- \[x\] renamed\? and enough more words/)
    await openEdit(1)
    await key('a', { meta: true })
    await type('renamed?')
    await key('return')
    expect(state.file).toMatch(/- \[x\] renamed\?\n/)
    expect(await typing()).toBe(false)
    await openEdit(1)
    await key('backspace')
    await key('return')
    // the cross closes without keeping
    await openEdit(1)
    await type(' thrown away')
    await click(EDGE, 1)
    expect(await typing()).toBe(false)
    expect(state.file).not.toMatch(/thrown away/)
    // delete is drawn over the open row
    await openEdit(1)
    // (the bin is in the second slot from the right of the row being typed in)
    await click(WIDE - 5, 1)
    expect(state.file).not.toMatch(/renamed/)

    // the foot row starts a sublist
    const foot = async () => (await rows()) - 1
    await click(2, await foot())
    expect(await typing()).toBe(true)
    await type('Later')
    await key('return')
    expect(state.file).toMatch(/## Later\n$/)
    // a new name long enough to wrap is kept whole
    await click(EDGE, 0)
    await type('buy the big blue bucket from the shop on the corner today')
    await key('return')
    expect(state.file).toMatch(/- \[ \] buy the big blue bucket from the shop on the corner today\n/)
    // a change to a line the file no longer has that name on does nothing
    const kept = state.file
    await pane.post?.({ act: 'tick', line: 2, was: 'not what is there' })
    expect(state.file).toBe(kept)
  })

for (const surface of ['terminal', 'desktop'] as const)
  test(`a sublist is carried by its grip, and notes open out, on ${surface}`, async ($, on) => {
    // rows: 0 General, 1 a, 2 gap, 3 one, 4 b, 5 gap, 6 two, 7 c, 8 gap, 9 foot
    const state = world(on, '- [ ] a\n  ask about parking\n  - [ ] ring the venue\n\n## one\n- [ ] b\n\n## two\n- [ ] c\n')
    await $.command.run({ command: 'task', args: '' })
    const pane = await $.ui.mount({ ...PANE, surface })
    await pane.resize({ columns: WIDE, rows: 10, in: 'list-0' })
    const drawn = async () => JSON.stringify(await pane.drawn({ in: 'list-0' }))
    // Rows stand at different heights, and the pointer reports rows of the grid: `cell` is the grid
    // row that falls on the text of the list's row `row`, read off what the list drew.
    const cell = async (row: number) => {
      const kids = ((await pane.drawn({ in: 'list-0' })) as { children: { props: { height: number; paddingTop?: number } }[] }).children
      const off = kids.slice(0, row).reduce((sum, kid) => sum + kid.props.height, 0)

      return Math.max(0, Math.ceil(off + (kids[row].props.paddingTop ?? 0) - 0.5))
    }
    const click = async (x: number, row: number) => {
      const y = await cell(row)
      for (const type of ['down', 'up'] as const) await pane.pointer({ type, x, y, button: 'left', in: 'list-0' })
    }
    // a click on the empty part of the pane, under the last row
    const away = async () => {
      for (const type of ['down', 'up'] as const) await pane.pointer({ type, x: 8, y: 200, button: 'left', in: 'list-0' })
    }
    // a task with a note under it has the mark that opens it out; the note is not a row until then
    expect(await drawn()).not.toContain('ask about parking')
    await click(EDGE, 1)
    expect(await drawn()).toContain('ask about parking')
    await click(EDGE, 1)
    expect(await drawn()).not.toContain('ask about parking')
    // a sub-item under the task is a row of its own, ticked where it stands, and the task stays open
    await click(EDGE, 1)
    await click(5, 3)
    expect(state.file).toMatch(/- \[ \] a\n  ask about parking\n  - \[x\] ring the venue\n/)
    expect(await drawn()).toContain('ask about parking')
    await click(5, 3)
    await click(EDGE, 1)
    // a click on the empty part of the pane shuts a task that is opened out
    await click(EDGE, 1)
    expect(await drawn()).toContain('ask about parking')
    await away()
    expect(await drawn()).not.toContain('ask about parking')

    await pane.pointer({ type: 'down', x: 0, y: await cell(6), button: 'left', in: 'list-0' })
    await pane.pointer({ type: 'move', x: 0, y: await cell(4), button: 'left', in: 'list-0' })
    expect(await drawn()).toMatch(/"a".*"two".*"c".*"one".*"b".*New list/)
    await pane.pointer({ type: 'up', x: 0, y: await cell(4), button: 'left', in: 'list-0' })
    // the fixed heading cannot be carried
    await pane.pointer({ type: 'down', x: 0, y: await cell(0), button: 'left', in: 'list-0' })
    await pane.pointer({ type: 'move', x: 0, y: await cell(4), button: 'left', in: 'list-0' })
    await pane.pointer({ type: 'up', x: 0, y: await cell(4), button: 'left', in: 'list-0' })
    expect(state.file).toMatch(/^<!-- Tasks[^\n]*-->\n\n- \[ \] a\n  ask about parking\n  - \[ \] ring the venue\n\n## two\n- \[ \] c\n\n## one\n- \[ \] b\n$/)
  })

// What an agent does: one tool, a task named the way a person would name it, the list back every time.
test('an agent reads and changes the list through its one tool', async ($, on) => {
  const state = world(on, '* [ ] write brief\n  due Friday\n- [ ] write brief for client\n\n## Later\n- [x] call Sam\n')
  await $.command.run({ command: 'task', args: '' })
  const tasks = async (input: object) => JSON.stringify(await $.tool.call({ tool: 'mcp__task-list__tasks', ...input } as never))

  expect(await tasks({ action: 'show' })).toMatch(/write brief.*call Sam/)
  // a name that fits two tasks changes nothing and says so
  expect(await tasks({ action: 'done', task: 'write' })).toMatch(/fits 2 tasks/)
  // its whole name fits one; the task's note goes with it to the bottom of its list
  expect(await tasks({ action: 'done', task: 'Write Brief' })).toMatch(/Done: \\"write brief\\"/)
  expect(state.file).toMatch(/write brief for client\n\* \[x\] write brief\n  due Friday\n\n## Later/)
  // a sublist that is not there yet is made
  await tasks({ action: 'add', task: 'book room', list: 'Events' })
  expect(state.file).toMatch(/## Events\n- \[ \] book room\n$/)
  await tasks({ action: 'add', task: 'ring Sam back', list: 'later' })
  expect(state.file).toMatch(/## Later\n- \[ \] ring Sam back\n- \[x\] call Sam/)
  await tasks({ action: 'reopen', task: 'call sam' })
  expect(state.file).toMatch(/- \[ \] call Sam/)
  await tasks({ action: 'remove', task: 'client' })
  expect(state.file).not.toMatch(/client/)
  expect(await tasks({ action: 'done', task: 'nothing like this' })).toMatch(/no task is called/)
  // a note is put under a task, replaced, and taken away
  await tasks({ action: 'note', task: 'book room', note: 'for twelve people' })
  expect(state.file).toMatch(/- \[ \] book room\n  for twelve people\n/)
  await tasks({ action: 'note', task: 'book room', note: 'for twenty' })
  expect(state.file).toMatch(/- \[ \] book room\n  for twelve people\n  for twenty\n/)
  await tasks({ action: 'note', task: 'book room', note: '' })
  expect(state.file).not.toMatch(/twenty|twelve/)
  // a checkbox line inside a code block is not a task: it cannot be named, and it stays where it is
  state.file += '\n```\n- [ ] sample only\n```\n'
  expect(await tasks({ action: 'done', task: 'sample only' })).toMatch(/no task is called/)
  await tasks({ action: 'add', task: 'after the sample' })
  expect(state.file).toContain('```\n- [ ] sample only\n```')
  expect(state.file).not.toContain('\uE000')
  // a name sent with a line break in it is still one line of the file
  await tasks({ action: 'add', task: 'fix bug\n## Details' })
  expect(state.file).toMatch(/- \[ \] fix bug ## Details\n/)
  // a note goes on the task just added, not on another of the same name
  await tasks({ action: 'add', task: 'call Sam', note: 'new number', list: 'Later' })
  expect(state.file).toMatch(/- \[ \] call Sam\n  new number\n/)
  await tasks({ action: 'add', task: 'send invites', note: 'by Friday' })
  expect(state.file).toMatch(/- \[ \] send invites\n  by Friday\n/)
  // a sub-item is added under a task, and named, ticked and removed like any task, where it stands
  expect(await tasks({ action: 'add', task: 'draft the email', under: 'invites' })).toMatch(/under \\"send invites\\"/)
  expect(state.file).toMatch(/- \[ \] send invites\n  by Friday\n  - \[ \] draft the email\n/)
  await tasks({ action: 'done', task: 'draft the email' })
  expect(state.file).toMatch(/- \[ \] send invites\n  by Friday\n  - \[x\] draft the email\n/)
  await tasks({ action: 'remove', task: 'draft' })
  expect(state.file).toMatch(/- \[ \] send invites\n  by Friday\n(?!  -)/)
})

// A list that cannot be read is not an empty list: nothing may be saved over it.
test('a read that fails never leads to a save', async ($, on) => {
  let wrote = false
  on('fs.exists', async () => ({ value: true }))
  on('fs.read', async () => {
    throw new Error('disk says no')
  })
  on('fs.write', async () => {
    wrote = true

    return { value: undefined }
  })
  on('ui.open', async () => ({ value: undefined }))
  on('command.register', async () => ({ value: undefined }))
  on('tool.register', async () => ({ value: { tool: 'mcp__task-list__tasks' } }))
  await $.command.run({ command: 'task', args: 'new one' }).catch(() => {})
  expect(wrote).toBe(false)
})
