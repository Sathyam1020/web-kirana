// Domain enums shared between backend + future frontends.
// Phase 1 fills in OrderStatus, Unit, ActorType, etc. — keep this file as the canonical source.

export const Role = {
  CUSTOMER: "CUSTOMER",
  OWNER: "OWNER",
} as const

export type Role = (typeof Role)[keyof typeof Role]
