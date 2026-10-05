# task-list

A task list panel for Claude Code. You and Claude both work from the same list.

## Panel

- Add, tick off, rename, delete tasks
- Group tasks into lists
- Drag to reorder
- Open a task to read its notes and sub-tasks
- Hide done tasks
- Works in the desktop app and the terminal

## TASKS.md

- At the project root, created with your first task
- Plain markdown, one list per project
- Edit it by hand any time

```markdown
- [ ] A task
  A note
  - [ ] A sub-task
- [x] A done task

## A list
- [ ] Another task
```

## Claude

Claude gets a `tasks` tool. Ask in plain words:

- "What's left on my list?"
- "Add 'email the printer'"
- "I've booked the venue" (ticks it off)
- "Note on the venue: budget is $2,000"
- "Under 'book the venue', add a step to confirm the date"

Notes and sub-tasks are added by Claude or by editing `TASKS.md`. The panel shows them and lets you tick sub-tasks.

To rename, move or reorder, Claude edits `TASKS.md` directly. The panel updates after each change.

## Install

```bash
git clone https://github.com/amaezey/task-list ~/.claude/skills/task-list
```

Start a new Claude Code session, then type `/task`.

## Update

```bash
git -C ~/.claude/skills/task-list pull
```

## Needs

- Claude Code 2.1.289 or newer
- macOS for copy and paste in the panel
