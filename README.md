# task-list

A task list panel for Claude Code. Tasks live in a `TASKS.md` in your project folder.

## What it does

- Add, tick off, rename, delete tasks
- Group tasks into lists
- Drag to reorder
- Notes and sub-items under a task
- Hide done tasks
- Ask Claude to add, finish or remove tasks for you
- Works in the desktop app and the terminal

## Install

```bash
git clone https://github.com/amaezey/task-list ~/.claude/skills/task-list
```

Start a new Claude Code session, then type `/task`.

## Update

```bash
git -C ~/.claude/skills/task-list pull
```

## TASKS.md

```markdown
- [ ] A task
  A note
  - [ ] A sub-item
- [x] A done task

## A list
- [ ] Another task
```

## Needs

- Claude Code 2.1.289 or newer
- macOS for copy and paste in the panel
