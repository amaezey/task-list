# task-list

A Claude Code mod that keeps a project's task list in a side panel.

The list is a plain `TASKS.md` file in the project folder. The panel shows it, and Claude can read and change it too.

## What it does

- Tick tasks off. Done tasks drop to the bottom of their list.
- Group tasks into lists, with a count of what is left in each.
- Drag tasks and lists by their grip to reorder them.
- Open a task to see its notes and sub-items.
- Hide done tasks, or show them again.
- Ask Claude to add, finish, reopen or remove a task, or to add a note to one.

## Install

1. Copy this repo into your Claude Code skills folder:

   ```bash
   git clone https://github.com/amaezey/task-list ~/.claude/skills/task-list
   ```

2. Start a new Claude Code session.
3. Type `/task` to open the panel. `/task buy milk` adds a task.

The panel opens by itself in any folder that already has a `TASKS.md`.

## Update

```bash
git -C ~/.claude/skills/task-list pull
```

## The file

```markdown
- [ ] A task
  A note under it
  - [ ] A sub-item
- [x] A done task

## A list
- [ ] Another task
```

You can edit `TASKS.md` by hand at any time. Lines the panel does not understand are left exactly where they are.

## Limits

- Built and used in the Claude desktop app on a Mac. The terminal view passes its tests but has not been looked at on a real screen.
- Paste and copy inside the panel use macOS commands.
- Needs a Claude Code version that runs mods.

## Working on it

Needs [Bun](https://bun.sh). `CLAUDE.md` explains how the code is laid out.

```bash
bun check.ts
claude plugin test .
claude plugin validate .
```
