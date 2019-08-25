import { Message, WebhookEvent } from '@line/bot-sdk'
import { Context } from './context'

export interface TextEvent {
  sourceId: string
  text: string
  original: WebhookEvent
}

export type ActionCallback<SESSION> = (
  event: TextEvent,
  context: Context<SESSION>
) => any

export interface Action<SESSION> {
  before?: ActionCallback<SESSION>
  after?: ActionCallback<SESSION>
}

export interface PersistentContext {
  sourceId: string
  session: any
  currentSkill?: string
  currentAction?: string
}

export interface StorageHandler {
  store(context: PersistentContext): Promise<void> | void
  fetch(
    sourceId: string
  ): Promise<PersistentContext | void> | PersistentContext | void
}

export interface NluHandler {
  understand(text: string): string | void
}

export type SendMessageType = string | Message
