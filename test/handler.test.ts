import { expect } from 'chai'
import { MessageHandler, Skill } from '../src/handler'
import { buildTextMessage } from './test_helper'

class TestSession {
  public name?: string
}

const skill = new Skill<TestSession>()
skill.addAction('name', {
  before: (e, ctx) => {
    ctx.sendLater('a')
  },
  after: (e, ctx) => {
    ctx.session.name = e.text
    ctx.moveTo('age')
  },
})

skill.addAction('age', {
  before: (e, ctx) => {
    ctx.sendLater('b')
  },
  after: (e, ctx) => {
    ctx.sendLater(`name:${ctx.session.name}, age:${e.text}`)
    ctx.abortSkill()
  },
})

const handler = new MessageHandler()
handler.addSkill('testSkill', skill)

describe('MessageHandler', () => {
  it('can handle message event', async () => {
    const userId = 'Uaaaabbbbccccddddeeeeffff11112222'
    expect(
      await handler.handleMessage(buildTextMessage(userId, 'testSkill'))
    ).eql(['a'])
    expect(await handler.handleMessage(buildTextMessage(userId, 'HOGE'))).eql([
      'b',
    ])
    expect(await handler.handleMessage(buildTextMessage(userId, 'FUGA'))).eql([
      'name:HOGE, age:FUGA',
    ])
  })
})
