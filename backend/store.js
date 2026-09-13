import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const dataFile = path.resolve(
  process.env.AMICAL_DATA_FILE || path.join(".data", "amical-store.json"),
);
const initialCredits = Number.parseInt(process.env.AMICAL_INITIAL_CREDITS || "125", 10);

let writeQueue = Promise.resolve();

function emptyStore() {
  return {
    schemaVersion: 1,
    users: {},
    generations: [],
    transactions: [],
  };
}

function normalizeStore(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AMICAL data store is not a valid object.");
  }

  // Additive-only normalization: unknown fields and all existing records remain intact.
  return {
    ...value,
    schemaVersion: Number(value.schemaVersion) || 1,
    users: value.users && typeof value.users === "object" ? value.users : {},
    generations: Array.isArray(value.generations) ? value.generations : [],
    transactions: Array.isArray(value.transactions) ? value.transactions : [],
  };
}

async function readStore() {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return emptyStore();
    if (error instanceof SyntaxError) {
      throw new Error("AMICAL data store contains invalid JSON; no data was overwritten.");
    }
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, dataFile);
}

function enqueueWrite(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

export async function updateStore(mutator) {
  return enqueueWrite(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
}

export async function readStoreSnapshot() {
  await writeQueue;
  return readStore();
}

function ensureUser(store, userId) {
  if (!store.users[userId]) {
    store.users[userId] = {
      id: userId,
      credits: Number.isFinite(initialCredits) && initialCredits >= 0 ? initialCredits : 125,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  if (!Number.isFinite(Number(store.users[userId].credits))) {
    store.users[userId].credits = 0;
  }
  return store.users[userId];
}

export async function getCreditAccount(userId) {
  return updateStore((store) => {
    const user = ensureUser(store, userId);
    return { userId, credits: user.credits };
  });
}

export async function reserveGeneration({
  userId,
  requestId,
  prompt,
  model,
  mode,
  creditsUsed,
  metadata = {},
}) {
  return updateStore((store) => {
    const existing = store.generations.find(
      (generation) => generation.user_id === userId && generation.request_id === requestId,
    );
    if (existing) return { generation: existing, reused: true };

    const user = ensureUser(store, userId);
    if (user.credits < creditsUsed) {
      const error = new Error("Solde de crédits insuffisant.");
      error.code = "INSUFFICIENT_CREDITS";
      error.available = user.credits;
      error.required = creditsUsed;
      throw error;
    }

    const now = new Date().toISOString();
    const generation = {
      id: randomUUID(),
      user_id: userId,
      request_id: requestId,
      task_id: null,
      prompt,
      model,
      mode,
      status: "queued",
      video_url: null,
      credits_used: creditsUsed,
      created_at: now,
      completed_at: null,
      ...metadata,
    };

    user.credits -= creditsUsed;
    user.updatedAt = now;
    store.generations.unshift(generation);
    store.transactions.unshift({
      id: randomUUID(),
      user_id: userId,
      generation_id: generation.id,
      type: "debit",
      amount: creditsUsed,
      status: "reserved",
      created_at: now,
    });
    return { generation, reused: false };
  });
}

export async function attachTaskToGeneration({ userId, generationId, taskId }) {
  return updateStore((store) => {
    const generation = store.generations.find(
      (item) => item.id === generationId && item.user_id === userId,
    );
    if (!generation) return null;
    generation.task_id = taskId;
    generation.status = "processing";
    generation.updated_at = new Date().toISOString();
    return generation;
  });
}

export async function findGenerationForUser(userId, taskId) {
  const store = await readStoreSnapshot();
  return (
    store.generations.find(
      (generation) => generation.user_id === userId && generation.task_id === taskId,
    ) || null
  );
}

export async function listGenerations(userId, limit = 50) {
  const store = await readStoreSnapshot();
  return store.generations
    .filter((generation) => generation.user_id === userId)
    .slice(0, limit);
}

export async function settleGeneration({
  userId,
  taskId,
  status,
  videoUrl = null,
  errorMessage = null,
}) {
  return updateStore((store) => {
    const generation = store.generations.find(
      (item) => item.user_id === userId && item.task_id === taskId,
    );
    if (!generation) return null;

    const now = new Date().toISOString();
    const normalizedStatus = status === "completed" || status === "failed" ? status : "processing";
    generation.status = normalizedStatus;
    generation.video_url = videoUrl || generation.video_url || null;
    generation.error_message = errorMessage || generation.error_message || null;
    generation.updated_at = now;
    if (normalizedStatus === "completed") generation.completed_at ||= now;

    if (normalizedStatus === "failed") {
      const alreadyRefunded = store.transactions.some(
        (transaction) =>
          transaction.generation_id === generation.id && transaction.type === "refund",
      );
      if (!alreadyRefunded) {
        const user = ensureUser(store, userId);
        user.credits += generation.credits_used;
        user.updatedAt = now;
        store.transactions.unshift({
          id: randomUUID(),
          user_id: userId,
          generation_id: generation.id,
          type: "refund",
          amount: generation.credits_used,
          status: "completed",
          created_at: now,
        });
      }
    }
    return generation;
  });
}

export async function failGenerationAndRefund({ userId, generationId, errorMessage }) {
  return updateStore((store) => {
    const generation = store.generations.find(
      (item) => item.id === generationId && item.user_id === userId,
    );
    if (!generation) return null;
    const now = new Date().toISOString();
    generation.status = "failed";
    generation.error_message = errorMessage;
    generation.updated_at = now;
    const alreadyRefunded = store.transactions.some(
      (transaction) => transaction.generation_id === generation.id && transaction.type === "refund",
    );
    if (!alreadyRefunded) {
      const user = ensureUser(store, userId);
      user.credits += generation.credits_used;
      user.updatedAt = now;
      store.transactions.unshift({
        id: randomUUID(),
        user_id: userId,
        generation_id: generation.id,
        type: "refund",
        amount: generation.credits_used,
        status: "completed",
        created_at: now,
      });
    }
    return generation;
  });
}