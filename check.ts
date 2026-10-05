// bun check.ts
import assert from 'node:assert/strict'
import { addList, drop, dropList, file as fileTask, findList, headOf, insert, isDone, isOpen, lay, match, nameOf, notesOf, placeList, remove, rename, setNote, under, tick, toggle, wrap } from './hooks/tasks'

const file = ['- [ ] a', '- [ ] b', '', '## Design', '- [ ] c', '', '## Build', '']
assert.equal(toggle(file, 0)[0], '- [x] a')
assert.equal(toggle(toggle(file, 0), 0)[0], '- [ ] a')
assert.deepEqual(insert([''], -1, '- [ ] n'), [['- [ ] n', ''], 0])
assert.deepEqual(insert(file, -1, '- [ ] n')[0].slice(0, 4), ['- [ ] a', '- [ ] b', '- [ ] n', ''])
assert.deepEqual(addList([''], 'X'), ['## X', ''])
assert.deepEqual(addList(['- [ ] a', ''], 'X'), ['- [ ] a', '', '## X', ''])
assert.equal(headOf(file, 1), -1)
assert.equal(headOf(file, 4), 3)
const two = ['- [ ] a', '', '## Design', '- [ ] c', '', '## Build', '- [ ] d']
assert.deepEqual(dropList(two, 2), ['- [ ] a', '- [ ] c', '', '## Build', '- [ ] d', ''])
assert.deepEqual(dropList(['## Only', '- [ ] x', ''], 0), ['- [ ] x', ''])
assert.equal(rename(two, 2, 'Art')[2], '## Art')
assert.equal(rename(['- [x] a'], 0, 'b $1')[0], '- [x] b $1')
const mix = ['- [ ] a', '- [ ] b', '- [x] z', '', '## L', '- [ ] c', '- [ ] d']
assert.deepEqual(tick(mix, 0), ['- [ ] b', '- [x] z', '- [x] a', '', '## L', '- [ ] c', '- [ ] d']) // done drops to the bottom
assert.deepEqual(tick(mix, 2), ['- [ ] a', '- [ ] b', '- [ ] z', '', '## L', '- [ ] c', '- [ ] d']) // only done one reopens in place
assert.deepEqual(tick(['- [ ] a', '- [x] y', '- [x] z'], 2), ['- [ ] a', '- [ ] z', '- [x] y']) // reopened goes above the done
assert.deepEqual(tick(mix, 5), ['- [ ] a', '- [ ] b', '- [x] z', '', '## L', '- [ ] d', '- [x] c']) // stays in its own list
assert.deepEqual(tick(['- [x] z', '', '## L', '- [x] q'], 0), ['- [ ] z', '', '## L', '- [x] q']) // never crosses a heading
const board = ['- [ ] a', '- [ ] b', '', '## L', '- [ ] c', '', '## Empty', '']
assert.deepEqual(drop(board, 0, 2), ['- [ ] b', '- [ ] a', '', '## L', '- [ ] c', '', '## Empty', '']) // down one, within the top list
assert.deepEqual(drop(board, 0, 3), ['- [ ] b', '- [ ] a', '', '## L', '- [ ] c', '', '## Empty', '']) // just above a heading ends the list above it
assert.deepEqual(drop(board, 0, 4), ['- [ ] b', '', '## L', '- [ ] a', '- [ ] c', '', '## Empty', '']) // under a heading: top of that list
assert.deepEqual(drop(board, 0, 6), ['- [ ] b', '', '## L', '- [ ] c', '- [ ] a', '', '## Empty', '']) // bottom of a list
assert.deepEqual(drop(board, 0, null), ['- [ ] b', '', '## L', '- [ ] c', '', '## Empty', '- [ ] a', '']) // into an empty last list
assert.deepEqual(drop(board, 4, 0), ['- [ ] c', '- [ ] a', '- [ ] b', '', '## L', '', '## Empty', '']) // up, out of its list
assert.deepEqual(drop(board, 1, 1), board) // onto itself
assert.deepEqual(drop(board, 1, 2), board)
assert.deepEqual(wrap('short', 10), ['short'])
assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four'])
assert.deepEqual(wrap('abcdefghijkl mn', 5), ['abcde', 'fghij', 'kl mn'])
assert.deepEqual(placeList(two, 2, 1), ['- [ ] a', '', '## Build', '- [ ] d', '', '## Design', '- [ ] c', ''])
assert.deepEqual(placeList(two, 5, 0), ['- [ ] a', '', '## Build', '- [ ] d', '', '## Design', '- [ ] c', ''])
assert.deepEqual(placeList(two, 2, 0), ['- [ ] a', '', '## Design', '- [ ] c', '', '## Build', '- [ ] d', ''])
// the file as agents and people write it: any bullet, any tick case, deeper headings, notes under a task
const loose = ['# Title', '* [ ] star', '  note on star', '  - [ ] sub-item', '1. [X] numbered', '', '### Deep', '+ [ ] plus']
assert.deepEqual(loose.map(line => nameOf(line)), [undefined, 'star', undefined, undefined, 'numbered', undefined, 'Deep', 'plus'])
assert.ok(isOpen(loose[1]) && isDone(loose[4]) && !isOpen(loose[2]))
assert.equal(toggle(loose, 1)[1], '* [x] star') // keeps its bullet
assert.equal(toggle(loose, 4)[4], '1. [ ] numbered')
assert.equal(rename(loose, 1, 'new')[1], '* [ ] new')
assert.equal(rename(loose, 6, 'Deeper')[6], '### Deeper')
assert.deepEqual(notesOf(loose, 1), ['note on star', '- [ ] sub-item'])
assert.deepEqual(notesOf(loose, 4), [])
// a task's indented lines go where it goes
assert.deepEqual(tick(loose, 1), ['# Title', '1. [X] numbered', '* [x] star', '  note on star', '  - [ ] sub-item', '', '### Deep', '+ [ ] plus'])
assert.deepEqual(drop(loose, 1, 7), ['# Title', '1. [X] numbered', '', '### Deep', '* [ ] star', '  note on star', '  - [ ] sub-item', '+ [ ] plus'])
assert.deepEqual(drop(loose, 1, null), ['# Title', '1. [X] numbered', '', '### Deep', '+ [ ] plus', '* [ ] star', '  note on star', '  - [ ] sub-item'])
assert.deepEqual(remove(loose, 1), ['# Title', '1. [X] numbered', '', '### Deep', '+ [ ] plus'])
// naming a task: its whole name wins, a part of one name is enough, a part of two is a question
const named = ['- [ ] write brief', '- [ ] write brief for client', '- [x] Call Sam']
assert.deepEqual(match(named, 'write brief'), [0])
assert.deepEqual(match(named, 'client'), [1])
assert.deepEqual(match(named, 'call sam'), [2])
assert.deepEqual(match(named, 'write'), [0, 1])
assert.deepEqual(match(named, 'nothing'), [])
assert.deepEqual(match(named, ''), [])
assert.equal(findList(loose, 'deep'), 6)
assert.equal(findList(loose, 'none'), -1)
// a new task joins the open ones, above the done
assert.deepEqual(fileTask(['- [ ] a', '- [x] z', '', '## L', '- [x] y'], -1, '- [ ] n'), ['- [ ] a', '- [ ] n', '- [x] z', '', '## L', '- [x] y'])
assert.deepEqual(fileTask(['- [ ] a', '', '## L', '- [x] y'], 2, '- [ ] n'), ['- [ ] a', '', '## L', '- [ ] n', '- [x] y'])
assert.deepEqual(fileTask(['- [ ] a', ''], -1, '- [ ] n'), ['- [ ] a', '- [ ] n', ''])
assert.deepEqual(lay('short', 10, 20), [[0, 5]])
assert.deepEqual(lay('one two three four five', 8, 12), [[0, 8], [8, 19], [19, 23]]) // a shorter first line, then longer ones
assert.deepEqual(lay('abcdefghijkl', 5, 5), [[0, 5], [5, 10], [10, 12]]) // a word too long to break at a space
assert.deepEqual(lay('', 5, 5), [[0, 0]])
// a note is set, replaced and taken away; a sub-item under the task is left alone
assert.deepEqual(setNote(['- [ ] a', '- [ ] b'], 0, 'call first\nthen email'), ['- [ ] a', '  call first', '  then email', '- [ ] b'])
assert.deepEqual(setNote(['- [ ] a', '  old', '  - [ ] sub', '- [ ] b'], 0, 'new'), ['- [ ] a', '  new', '  - [ ] sub', '- [ ] b'])
assert.deepEqual(setNote(['- [ ] a', '  old', '- [ ] b'], 0, ''), ['- [ ] a', '- [ ] b'])
assert.deepEqual(under(['- [ ] a', '  a note', '  - [x] sub', '- [ ] b'], 0), [
  { line: 1, text: 'a note', item: false, isDone: false },
  { line: 2, text: 'sub', item: true, isDone: true },
])
assert.equal(toggle(['- [ ] a', '  - [ ] sub'], 1)[1], '  - [x] sub') // a sub-item is ticked where it stands
console.log('ok')

// a note with a blank line in it stays whole, and goes with its task
{
  const { tick, addNote, removeSub, drop } = await import('./hooks/tasks')
  const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`) }
  eq(tick(['- [ ] a', '  one', '', '  two', '- [ ] b'], 0), ['- [ ] b', '- [x] a', '  one', '', '  two'])
  eq(addNote(['- [ ] a', '  one', '  - [ ] sub'], 0, 'two'), ['- [ ] a', '  one', '  two', '  - [ ] sub'])
  eq(removeSub(['- [ ] a', '  - [ ] sub', '    deep', '  - [ ] next'], 1), ['- [ ] a', '  - [ ] next'])
  // an open task dropped at the end of a list lands above its done ones
  eq(drop(['- [ ] a', '- [ ] b', '- [x] c'], 0, null), ['- [ ] b', '- [ ] a', '- [x] c'])
  console.log('ok 2')
}
