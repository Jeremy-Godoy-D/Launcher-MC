export interface Drive {
  filesystem: string
  blocks: number
  used: number
  available: number
  capacity: number
  mounted: string

  selectedPath: string
}

export interface Bootstrap {
  preset(): Promise<{
    minecraftPath: string
    defaultPath: string
    locale: string
    drives: Drive[]
  }>
  /**
   * Confirm an absolute data directory. Resolves after native registration is ready.
   * Validation/preparation failures can be retried; a committed root cannot be replaced in this session.
   */
  bootstrap(
    path: string
  ): Promise<void>
}
