import { PersistentContext, SendMessageType } from './types'

export class Context<SESSION> {
  public static ofPersistent(persistent: PersistentContext): Context<any> {
    const ctx = new Context()
    ctx.sourceId = persistent.sourceId
    ctx.session = persistent.session
    ctx.currentSkill = persistent.currentSkill
    ctx.currentAction = persistent.currentAction
    return ctx
  }

  // these should be persisted
  public sourceId: string
  public session: SESSION
  public currentSkill?: string
  public currentAction?: string
  // these should not be persisted
  public nextSkill?: string
  public nextAction?: string
  public pendingMessages: SendMessageType[] = []

  public toPersistent(): PersistentContext {
    return {
      sourceId: this.sourceId,
      session: this.session,
      currentSkill: this.currentSkill,
      currentAction: this.currentAction,
    }
  }

  public sendLater(message: SendMessageType) {
    this.pendingMessages.push(message)
  }

  public moveTo(action: string) {
    this.nextAction = action
  }

  public abortSkill() {
    this.nextSkill = undefined
  }

  public jumpSkill(
    skill: string,
    action?: string,
    session: SESSION = {} as any
  ) {
    this.nextSkill = skill
    this.nextAction = action
    this.session = session
  }
}
