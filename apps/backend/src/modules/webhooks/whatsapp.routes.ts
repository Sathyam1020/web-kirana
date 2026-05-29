import express, { Router } from "express"
import * as controller from "./whatsapp.controller.js"

/**
 * Phase 10 — WhatsApp Cloud API webhook. Mounted at /v1/webhooks/whatsapp in
 * app.ts BEFORE express.json(), with express.raw() so POST signature
 * verification sees the untouched body (same raw-body requirement as the
 * better-auth handler). Public — auth is the GET verify token + the POST
 * X-Hub-Signature-256 HMAC, not a session.
 */
export const whatsappWebhookRouter: Router = Router()

whatsappWebhookRouter.get("/", controller.verify)
// Cap the raw body — Meta's receipts are a few KB; this bounds the cost of the
// HMAC compute on this unauthenticated path.
whatsappWebhookRouter.post("/", express.raw({ type: "*/*", limit: "100kb" }), controller.receive)
