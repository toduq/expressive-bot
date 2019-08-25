import { NluHandler } from './types'

export class TestNluHandler implements NluHandler {
  public understand(text: string): string | void {
    return text ? text : undefined
  }
}
