import { WebhookEvent } from '@line/bot-sdk'

export const buildTextMessage = (
  userId: string,
  text: string
): WebhookEvent => {
  return {
    timestamp: 0,
    source: { type: 'user', userId },
    type: 'message',
    replyToken: 'abc',
    message: { id: 'a', type: 'text', text },
  }
}
