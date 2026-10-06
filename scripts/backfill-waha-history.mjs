#!/usr/bin/env node

/**
 * Replays a bounded WAHA history window through the existing Chat Sales webhook.
 * The normal inbox idempotency key makes repeated executions safe.
 *
 * Required: WAHA_BASE_URL, WAHA_API_KEY, WAHA_SESSION
 * Optional: CHAT_SALES_WEBHOOK_URL, BACKFILL_DAYS=14, BACKFILL_CHAT_LIMIT=250,
 *           BACKFILL_MESSAGES_PER_CHAT=500, BACKFILL_DRY_RUN=true
 */

const baseUrl = String(process.env.WAHA_BASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.WAHA_API_KEY;
const session = process.env.WAHA_SESSION;
const days = Number(process.env.BACKFILL_DAYS || 14);
const chatLimit = Number(process.env.BACKFILL_CHAT_LIMIT || 250);
const messageLimit = Number(process.env.BACKFILL_MESSAGES_PER_CHAT || 500);
const dryRun = process.env.BACKFILL_DRY_RUN === "true";
const concurrency = Math.max(1, Math.min(20, Number(process.env.BACKFILL_CONCURRENCY || 8)));

if (!baseUrl || !apiKey || !session) {
  throw new Error("WAHA_BASE_URL, WAHA_API_KEY and WAHA_SESSION are required");
}
if (![days, chatLimit, messageLimit].every(Number.isFinite)) {
  throw new Error("Backfill numeric limits must be valid numbers");
}

const headers = { "X-Api-Key": apiKey };
const cutoff = Math.floor(Date.now() / 1000) - Math.max(1, days) * 86400;

async function waha(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`WAHA HTTP ${response.status} for ${path.split("?")[0]}`);
  return response.json();
}

function jid(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value._serialized === "string") return value._serialized;
  if (typeof value.id === "string") return value.id;
  if (typeof value.user === "string" && typeof value.server === "string") {
    return `${value.user}@${value.server}`;
  }
  return "";
}

const lidCache = new Map();
async function phoneJid(value) {
  const raw = jid(value);
  if (!raw.endsWith("@lid")) return raw;
  if (!lidCache.has(raw)) {
    lidCache.set(raw, (async () => {
      const result = await waha(`/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(raw)}`);
      const resolved = jid(result.pn);
      if (!resolved || resolved.endsWith("@lid")) {
        throw new Error("WAHA returned an unresolved LID");
      }
      return resolved;
    })());
  }
  return await lidCache.get(raw);
}

async function discoverWebhook() {
  if (process.env.CHAT_SALES_WEBHOOK_URL) {
    return { url: process.env.CHAT_SALES_WEBHOOK_URL, headers: {} };
  }
  const config = await waha(`/api/sessions/${encodeURIComponent(session)}`);
  function find(value) {
    if (!value || typeof value !== "object") return undefined;
    if (typeof value.url === "string" && value.url.includes("/v1/webhooks/whatsapp/")) {
      const customHeaders = Array.isArray(value.customHeaders) ? value.customHeaders : [];
      const resolvedHeaders = Object.fromEntries(
        customHeaders
          .filter((item) => item && typeof item.name === "string" && typeof item.value === "string")
          .map((item) => [item.name, item.value])
      );
      return { url: value.url, headers: resolvedHeaders };
    }
    for (const nested of Object.values(value)) {
      const found = find(nested);
      if (found) return found;
    }
    return undefined;
  }
  const webhook = find(config);
  if (!webhook) throw new Error("Chat Sales webhook was not found in the WAHA session configuration");
  return webhook;
}

function isDirectChat(chatId) {
  return chatId.endsWith("@c.us") || chatId.endsWith("@lid");
}

function mediaUrl(message) {
  const candidate = message?.media?.url || message?.mediaUrl;
  return typeof candidate === "string" && /^https?:\/\//.test(candidate) ? candidate : undefined;
}

const webhook = await discoverWebhook();
const chats = await waha(`/api/${encodeURIComponent(session)}/chats?limit=${Math.max(1, chatLimit)}`);
const selected = chats.filter((chat) => {
  const chatId = jid(chat.id);
  const timestamp = Number(chat.conversationTimestamp || 0);
  return isDirectChat(chatId) && timestamp >= cutoff;
}).sort((a, b) => Number(b.conversationTimestamp || 0) - Number(a.conversationTimestamp || 0));

let scanned = 0;
let eligible = 0;
let accepted = 0;
let failed = 0;

async function replay(payload) {
  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...webhook.headers },
      body: JSON.stringify({ event: "message", session, payload }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok || response.status === 202 || response.status === 409) accepted += 1;
    else failed += 1;
  } catch {
    failed += 1;
  }
}

async function collectChat(chat) {
  const chatId = jid(chat.id);
  const messages = await waha(
    `/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}/messages?limit=${Math.max(1, messageLimit)}`
  );

  for (const message of messages) {
    scanned += 1;
    const timestamp = Number(message.timestamp || 0);
    const from = jid(message.from);
    const to = jid(message.to);
    if (timestamp < cutoff || !message.id || !isDirectChat(message.fromMe ? to : from)) continue;

    try {
      const payload = {
        ...message,
        from: await phoneJid(from),
        to: await phoneJid(to),
        session,
        ...(mediaUrl(message) ? { mediaUrl: mediaUrl(message) } : {}),
      };
      eligible += 1;
      if (!dryRun) await replay(payload);
    } catch {
      failed += 1;
    }
  }
}

let chatCursor = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
    while (chatCursor < selected.length) {
      const chat = selected[chatCursor++];
      try {
        await collectChat(chat);
      } catch {
        failed += 1;
      }
    }
  })
);

console.log(JSON.stringify({ dryRun, days, chats: selected.length, scanned, eligible, accepted, failed, concurrency }));
if (failed > 0) process.exitCode = 1;
