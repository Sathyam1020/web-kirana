import { EventEmitter } from "node:events"
import { logger } from "./logger.js"

/**
 * Typed domain event bus. Phase 4 controllers `events.emit(...)` after every
 * mutation; consumers register via `events.on(type, handler)`.
 *
 * For Phase 4.1 the only consumer is the logger (so every event leaves a
 * trail). Phase 9 plugs Socket.IO into this bus; Phase 10 plugs WhatsApp +
 * web-push. Controllers don't change.
 *
 * Handlers run synchronously by default; if a handler returns a Promise it's
 * not awaited (fire-and-forget) so a slow/failing notification can never
 * block the mutation that triggered it.
 */
export type DomainEvent =
  | { type: "store.created"; storeId: string; ownerId: string }
  | { type: "store.updated"; storeId: string; ownerId: string; fields: string[] }
  | { type: "store.opened"; storeId: string; ownerId: string }
  | { type: "store.closed"; storeId: string; ownerId: string }
  | { type: "product.created"; storeId: string; productId: string; ownerId: string }
  | {
      type: "product.updated"
      storeId: string
      productId: string
      ownerId: string
      fields: string[]
    }
  | { type: "product.deleted"; storeId: string; productId: string; ownerId: string }
  | { type: "product.restored"; storeId: string; productId: string; ownerId: string }
  | { type: "category.created"; categoryId: string; actorId: string }
  | {
      type: "category.updated"
      categoryId: string
      actorId: string
      fields: string[]
    }
  | { type: "address.created"; addressId: string; customerId: string }
  | {
      type: "address.updated"
      addressId: string
      customerId: string
      fields: string[]
    }
  | { type: "address.deleted"; addressId: string; customerId: string }
  | {
      type: "address.default_changed"
      addressId: string
      customerId: string
    }
  // Phase 6.6 — taxonomy
  | { type: "department.created"; departmentId: string; actorId: string }
  | {
      type: "department.updated"
      departmentId: string
      actorId: string
      fields: string[]
    }
  | {
      type: "subcategory.created"
      subcategoryId: string
      storeId: string
      categoryId: string
      ownerId: string
    }
  | {
      type: "subcategory.updated"
      subcategoryId: string
      storeId: string
      ownerId: string
      fields: string[]
    }
  | {
      type: "subcategory.deleted"
      subcategoryId: string
      storeId: string
      ownerId: string
    }
  | {
      type: "subcategory.availability_changed"
      subcategoryId: string
      storeId: string
      ownerId: string
      isAvailable: boolean
    }
  | {
      type: "product.moved"
      productId: string
      storeId: string
      ownerId: string
      fromSubcategoryId: string
      toSubcategoryId: string
    }

type EventType = DomainEvent["type"]
type EventPayload<T extends EventType> = Extract<DomainEvent, { type: T }>
type EventHandler<T extends EventType> = (event: EventPayload<T>) => void | Promise<void>

class DomainEventBus {
  private readonly emitter = new EventEmitter({ captureRejections: true })

  constructor() {
    this.emitter.setMaxListeners(50)
    this.emitter.on("error", (err) => {
      logger.error({ err }, "domain event bus: handler error")
    })
  }

  on<T extends EventType>(type: T, handler: EventHandler<T>): void {
    // Wrap so a synchronous throw or rejected promise becomes a logged warning
    // instead of crashing the process via 'error' event chain.
    const safe = (event: EventPayload<T>): void => {
      try {
        const result = handler(event)
        if (result instanceof Promise) {
          result.catch((err) => {
            logger.warn({ err, eventType: type }, "async event handler rejected")
          })
        }
      } catch (err) {
        logger.warn({ err, eventType: type }, "event handler threw")
      }
    }
    this.emitter.on(type, safe)
  }

  emit(event: DomainEvent): void {
    logger.debug({ event }, "domain event")
    this.emitter.emit(event.type, event)
  }
}

export const events = new DomainEventBus()
