// Which slash command each session belongs to. A resumed turn is started from a reply,
// not a command, but the permission policy still needs to know the command (e.g. /apply).

const MAX_SESSIONS = 200

export class SessionCommands {
  private map = new Map<string, string>()

  remember(sessionId: string, command: string): void {
    this.map.delete(sessionId)
    if (this.map.size >= MAX_SESSIONS) this.map.delete(this.map.keys().next().value as string)
    this.map.set(sessionId, command)
  }

  commandFor(sessionId: string): string | undefined {
    return this.map.get(sessionId)
  }
}
