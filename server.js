import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  attachTaskToGeneration,
  failGenerationAndRefund,
  findGenerationForUser,
  getCreditAccount,
  listGenerations,
  reserveGeneration,
  settleGeneration,
} from "./backend/store.js";
import { getAuthenticatedUser, requireUser } from "./backend/auth.js";
import {
  isBytePlusConfigured,
  MODEL as DEFAULT_MODEL,
  pollGeneration,
  submitGeneration,
} from "./backend/byteplusService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 3000;
const dist = path.join(__dirname, "dist");
const generationCost = Number.parseInt(process.env.AMICAL_VIDEO_CREDITS || "25", 10);
const rateBuckets = new Map();

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.json({ limit: "2mb", strict: true }));

function publicError(error, fallback = "Erreur serveur.") {
  if (error?.code === "BYTEPLUS_NOT_CONFIGURED") {
    return {
      status: 503,
      body: {
        error: "La génération vidéo est prête, mais BYTEPLUS_API_KEY n’est pas configurée côté serveur.",
        code: error.code,
      },
    };
  }
  if (error?.code === "INSUFFICIENT_CREDITS") {
    return {
      status: 402,
      body: {
        error: error.message,
        code: error.code,
        available: error.available,
        required: error.required,
      },
    };
  }
  if (error?.code === "BYTEPLUS_TIMEOUT") {
    return { status: 504, body: { error: error.message, code: error.code } };
  }
  if (error?.code?.startsWith("BYTEPLUS_")) {
    return {
      status: 502,
      body: {
        error: "Le fournisseur vidéo a refusé ou interrompu la requête.",
        code: error.code,
      },
    };
  }
  return { status: 500, body: { error: error?.message || fallback } };
}

function rateLimit({ limit, windowMs }) {
  return (req, res, next) => {
    const userId = req.currentUser?.id || req.ip || "anonymous";
    const key = `${userId}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      rateBuckets.set(key, { startedAt: now, count: 1 });
      return next();
    }
    if (bucket.count >= limit) {
      return res.status(429).json({
        error: "Trop de requêtes. Réessayez dans quelques instants.",
        code: "RATE_LIMITED",
      });
    }
    bucket.count += 1;
    return next();
  };
}

function validateGenerationInput(body) {
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3 || prompt.length > 2_000) {
    return "Le prompt doit contenir entre 3 et 2 000 caractères.";
  }
  const mode = body?.mode === "character-replace" ? "character-replace" : "text-to-video";
  if (mode === "character-replace") {
    if (typeof body.videoUrl !== "string" || !/^https?:\/\//.test(body.videoUrl)) {
      return "Une URL vidéo source publique est requise pour le remplacement.";
    }
    if (
      !Array.isArray(body.imageUrls) ||
      body.imageUrls.length < 1 ||
      body.imageUrls.length > 3 ||
      body.imageUrls.some((url) => typeof url !== "string" || !/^https?:\/\//.test(url))
    ) {
      return "Une à trois URLs d’images de référence publiques sont requises.";
    }
  }
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "amical-labs",
    byteplusConfigured: isBytePlusConfigured(),
    model: DEFAULT_MODEL,
  });
});

app.get("/api/session", (req, res) => {
  const user = getAuthenticatedUser(req);
  res.json({
    authenticated: Boolean(user),
    user: user ? { id: user.id } : null,
    authRequired: !user,
  });
});

app.get("/api/credits", requireUser, async (req, res) => {
  try {
    res.json(await getCreditAccount(req.currentUser.id));
  } catch (error) {
    const result = publicError(error);
    res.status(result.status).json(result.body);
  }
});

app.get("/api/video/history", requireUser, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 100);
    res.json({ generations: await listGenerations(req.currentUser.id, limit) });
  } catch (error) {
    const result = publicError(error);
    res.status(result.status).json(result.body);
  }
});

async function generateVideo(req, res) {
  const inputError = validateGenerationInput(req.body);
  if (inputError) return res.status(400).json({ error: inputError, code: "INVALID_REQUEST" });
  if (!isBytePlusConfigured()) {
    return res.status(503).json({
      error: "La génération vidéo est prête, mais BYTEPLUS_API_KEY n’est pas configurée côté serveur.",
      code: "BYTEPLUS_NOT_CONFIGURED",
    });
  }

  const body = req.body;
  const requestId =
    typeof body.requestId === "string" && body.requestId.length <= 120
      ? body.requestId
      : randomUUID();
  const mode = body.mode === "character-replace" ? "character-replace" : "text-to-video";
  const model =
    typeof body.model === "string" && body.model.length <= 120 ? body.model : DEFAULT_MODEL;

  let reserved;
  try {
    reserved = await reserveGeneration({
      userId: req.currentUser.id,
      requestId,
      prompt: body.prompt.trim(),
      model,
      mode,
      creditsUsed: generationCost,
      metadata: {
        character_id: body.characterId || null,
      },
    });
  } catch (error) {
    const result = publicError(error);
    return res.status(result.status).json(result.body);
  }
  if (reserved.reused && reserved.generation.task_id) {
    return res.status(200).json({ generation: reserved.generation, reused: true });
  }

  try {
    const submitted = await submitGeneration({
      prompt: body.prompt.trim(),
      mode,
      videoUrl: body.videoUrl,
      imageUrls: body.imageUrls,
      instructions: body.instructions,
    });
    const generation = await attachTaskToGeneration({
      userId: req.currentUser.id,
      generationId: reserved.generation.id,
      taskId: submitted.taskId,
    });
    return res.status(202).json({ generation, taskId: submitted.taskId });
  } catch (error) {
    await failGenerationAndRefund({
      userId: req.currentUser.id,
      generationId: reserved.generation.id,
      errorMessage: error.code?.startsWith("BYTEPLUS_")
        ? "Le fournisseur vidéo n’a pas accepté la tâche."
        : "La tâche n’a pas pu être créée.",
    });
    const result = publicError(error, "Impossible de démarrer la génération.");
    return res.status(result.status).json(result.body);
  }
}

app.post(
  "/api/video/generate",
  requireUser,
  rateLimit({ limit: 10, windowMs: 60_000 }),
  generateVideo,
);

// Backward-compatible route kept for existing AMICAL LABS integrations.
app.post(
  "/api/video/replace-character",
  requireUser,
  rateLimit({ limit: 10, windowMs: 60_000 }),
  (req, res) => generateVideo({ ...req, body: { ...req.body, mode: "character-replace" } }, res),
);

app.get(
  "/api/video/generation/:taskId",
  requireUser,
  rateLimit({ limit: 60, windowMs: 60_000 }),
  async (req, res) => {
    const taskId = String(req.params.taskId || "").trim();
    if (!taskId || taskId.length > 200) {
      return res.status(400).json({ error: "taskId invalide.", code: "INVALID_TASK_ID" });
    }
    try {
      const ownedGeneration = await findGenerationForUser(req.currentUser.id, taskId);
      if (!ownedGeneration) {
        return res.status(404).json({ error: "Génération introuvable.", code: "NOT_FOUND" });
      }
      if (ownedGeneration.status === "completed" || ownedGeneration.status === "failed") {
        return res.json({ generation: ownedGeneration });
      }

      const provider = await pollGeneration(taskId);
      const generation = await settleGeneration({
        userId: req.currentUser.id,
        taskId,
        status: provider.status,
        videoUrl: provider.videoUrl,
        errorMessage: provider.status === "failed" ? "La génération BytePlus a échoué." : null,
      });
      return res.json({ generation });
    } catch (error) {
      const result = publicError(error, "Impossible de suivre la génération.");
      return res.status(result.status).json(result.body);
    }
  },
);

app.use(express.static(dist));
app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
  res.sendFile(path.join(dist, "index.html"), (error) => {
    if (error && !res.headersSent) {
      res.status(503).send("Build frontend absent. Lancez npm run build.");
    }
  });
});

app.listen(port, () => console.log(`AMICAL LABS listening on ${port}`));