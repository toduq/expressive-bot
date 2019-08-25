import { PersistentContext, StorageHandler } from './types'

export class OnMemoryStorageHandler implements StorageHandler {
  public storage: { [key: string]: string } = {}

  public store(context: PersistentContext): void {
    this.storage[context.sourceId] = JSON.stringify(context)
  }

  public fetch(sourceId: string): PersistentContext | void {
    const str = this.storage[sourceId]
    return str != null ? JSON.parse(str) : undefined
  }
}
