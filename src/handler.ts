import {
  Client,
  Message,
  ReplyableEvent,
  TextMessage,
  WebhookEvent,
} from '@line/bot-sdk'
import * as debug from 'debug'
import { Context } from './context'
import { TestNluHandler } from './nlu'
import { OnMemoryStorageHandler } from './storage'
import {
  Action,
  ActionCallback,
  NluHandler,
  StorageHandler,
  TextEvent,
} from './types'

const logger = debug('ebot:handler')

export class Skill<SESSION> {
  public defaultAction: string
  public actionMap: { [key: string]: Action<SESSION> } = {}

  public addAction(name: string, callbacks: Action<SESSION>) {
    this.actionMap[name] = callbacks
    if (this.defaultAction == null) {
      this.defaultAction = name
    }
  }
}

enum NextTask {
  NLU,
  ExecAfter,
  AskAgain,
  StartDefault,
  ExecBefore,
  ResetSession,
  DONE,
}

export class MessageHandler {
  // required handlers
  public storageHandler: StorageHandler = new OnMemoryStorageHandler()
  public nluHandler: NluHandler = new TestNluHandler()

  // optional arguments
  public lineClient?: Client

  // callbacks
  public nonTextCallback?: (
    event: WebhookEvent,
    context: Context<any>
  ) => Promise<string | void> | string | void
  public askAgainCallback?: ActionCallback<any>

  private skillMap: { [key: string]: Skill<any> } = {}

  public addSkill(name: string, skill: Skill<any>) {
    this.skillMap[name] = skill
  }

  public resetState(ctx: Context<any>): NextTask {
    logger('Reset state')
    ctx.currentSkill = undefined
    ctx.currentAction = undefined
    ctx.session = {}
    return NextTask.DONE
  }

  public findAction(ctx: Context<any>): Action<any> | void {
    const skill = this.skillMap[ctx.currentSkill!]
    if (skill == null) {
      logger('Skill not found : %s', ctx.currentSkill)
    } else {
      const action = skill.actionMap[ctx.currentAction!]
      if (action == null) {
        logger('Action not found : %s:%s', ctx.currentSkill, ctx.currentAction)
      } else {
        return action
      }
    }
  }

  public async handleMessage(webhook: WebhookEvent) {
    const sourceId: string =
      webhook.source.type === 'user'
        ? webhook.source.userId
        : webhook.source.type === 'room'
        ? webhook.source.roomId
        : webhook.source.groupId

    let persistentContext = await this.storageHandler.fetch(sourceId)
    if (persistentContext == null) {
      persistentContext = { sourceId, session: {} }
      logger('Session started for %s', sourceId)
    } else {
      logger('Session restored for %s', sourceId)
    }
    const ctx: Context<any> = Context.ofPersistent(persistentContext)

    let receivedText = null
    if (webhook.type === 'message' && webhook.message.type === 'text') {
      receivedText = webhook.message.text
    } else if (webhook.type === 'postback') {
      receivedText = webhook.postback.data
    } else {
      if (this.nonTextCallback != null) {
        receivedText = await this.nonTextCallback(webhook, ctx)
      }
    }

    let nextTask: NextTask =
      ctx.currentSkill == null ? NextTask.NLU : NextTask.ExecAfter
    if (receivedText == null) {
      logger('Discard message, text not found')
      nextTask = NextTask.DONE
    }

    const event: TextEvent = {
      sourceId,
      text: receivedText as string,
      original: webhook,
    }

    if (nextTask === NextTask.NLU) {
      const result = this.nluHandler.understand(event.text)
      if (result != null && this.skillMap.hasOwnProperty(result)) {
        ctx.nextSkill = result
        ctx.nextAction = undefined
        nextTask = NextTask.StartDefault
        logger('NLU accepted %o', { input: event.text, output: result })
      } else {
        nextTask = NextTask.AskAgain
        logger('NLU rejected %o', { input: event.text, output: result })
      }
    }

    if (nextTask === NextTask.ExecAfter) {
      ctx.nextSkill = ctx.currentSkill
      ctx.nextAction = ctx.currentAction

      const action = this.findAction(ctx)
      if (action == null) {
        nextTask = NextTask.DONE
      } else {
        if (action.after == null) {
          logger('After was skipped because it is not defined')
        } else {
          await action.after(event, ctx)
          logger('Executed after-callback with %o', ctx)
        }
      }
      if (
        ctx.nextSkill === ctx.currentSkill &&
        ctx.nextAction === ctx.currentAction
      ) {
        nextTask = NextTask.AskAgain
      } else if (ctx.nextSkill == null) {
        nextTask = NextTask.ResetSession
      } else if (ctx.nextSkill !== ctx.currentSkill && ctx.nextAction == null) {
        nextTask = NextTask.StartDefault
      } else {
        nextTask = NextTask.ExecBefore
      }
    }

    if (nextTask === NextTask.AskAgain) {
      if (this.askAgainCallback != null) {
        await this.askAgainCallback(event, ctx)
      } else {
        logger('Ask again callback not found')
      }
    }

    if (nextTask === NextTask.StartDefault) {
      const skill = this.skillMap[ctx.nextSkill!]
      if (skill != null) {
        ctx.nextAction = skill.defaultAction
        nextTask = NextTask.ExecBefore
      } else {
        logger('Want to start skill %s, but not found', ctx.nextSkill)
        nextTask = this.resetState(ctx)
      }
    }

    if (nextTask === NextTask.ExecBefore) {
      ctx.currentSkill = ctx.nextSkill
      ctx.currentAction = ctx.nextAction
      ctx.nextSkill = undefined
      ctx.nextAction = undefined
      const action = this.findAction(ctx)
      if (action == null) {
        nextTask = NextTask.DONE
      } else {
        if (action.before == null) {
          logger('Before was skipped because it is not defined')
        } else {
          await action.before(event, ctx)
          logger('Executed before-callback with %o', ctx)
        }
      }
    }

    if (nextTask === NextTask.ResetSession) {
      ctx.currentSkill = undefined
      ctx.currentAction = undefined
      ctx.session = {}
    }

    const sendMessages = ctx.pendingMessages
    if (ctx.pendingMessages.length > 0) {
      ctx.pendingMessages = []
      const messages: Message[] = sendMessages.map(m => {
        return typeof m === 'string'
          ? ({ type: 'text', text: m } as TextMessage)
          : m
      })
      if (this.lineClient != null) {
        const token: string = (webhook as ReplyableEvent).replyToken
        try {
          if (token != null) {
            logger('Replying messages %o', messages)
            await this.lineClient.replyMessage(token, messages)
          } else {
            logger('Pushing messages %o', messages)
            await this.lineClient.pushMessage(sourceId, messages)
          }
        } catch (err) {
          logger('Error occured while sending message')
          throw err
        }
      }
    }

    await this.storageHandler.store(ctx.toPersistent())
    return sendMessages
  }
}
