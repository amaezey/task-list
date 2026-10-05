export type TaskFile = string

declare module 'claude-code' {
  interface PluginState {
    'task-list': { text: TaskFile; editing: number | null; expanded: number | null; liveRows: number; wide: number; hotIcon: string; hideDone: boolean; draft: string; field: number; clip: { n: number; text: string }; adding: 'task' | 'list' | number | null }
  }
}
