# task-list

A task list panel for Claude Code. You and Claude both work from the same list.

## What it does

- Add, tick off, rename, delete tasks
- Group tasks into lists
- Drag to reorder
- Hide done tasks
- Claude reads the same list, and adds or ticks off tasks when you ask
- Claude can add notes and sub-tasks under a task; open the task to see them
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
