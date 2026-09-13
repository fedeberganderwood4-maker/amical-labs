// AMICAL LABS — server-only BytePlus ModelArk / Seedance adapter.
// Never import this module from the browser and never log the API key or provider body.

const BASE_URL =
  process.env.BYTEPLUS_BASE_URL ||
  "https://operator.las.ap-southeast-1.bytepluses.com";
const OPERATOR_ID = process.env.BYTEPLUS_OPERATOR_ID || "las_video_edit_enhance";
const OPERATOR_VERSION = process.env.BYTEPLUS_OPERATOR_VERSION || "v1";
const MODEL = process.env.BYTEPLUS_MODEL || "dreamina-seedance-2-5-260628";

export function isBytePlusConfigured() {
  return Boolean(process.env.BYTEPLUS_API_KEY);
}

function authHeaders() {
  if (!isBytePlusConfigured()) {
    const error = new Error("BytePlus n’est pas encore configuré côté serveur.");
    error.code = "BYTEPLUS_NOT_CONFIGURED";
    throw error;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.BYTEPLUS_API_KEY}`,
  };
}

async function readProviderResponse(response, operation) {
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(`BytePlus ${operation} failed with status ${response.status}.`);
    error.code = "BYTEPLUS_REQUEST_FAILED";
    error.providerStatus = response.status;
    error.providerMessage =
      body?.metadata?.error_msg || body?.error?.message || body?.error || null;
    throw error;
  }
  return body;
}

async function bytePlusRequest(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await readProviderResponse(response, path.includes("poll") ? "poll" : "submit");
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("BytePlus n’a pas répondu dans le délai imparti.");
      timeoutError.code = "BYTEPLUS_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractTaskId(body) {
  return (
    body?.task_id ||
    body?.taskId ||
    body?.id ||
    body?.data?.task_id ||
    body?.data?.taskId ||
    body?.data?.id ||
    null
  );
}

function extractVideoUrl(body) {
  const candidates = [
    body?.video_url,
    body?.videoUrl,
    body?.output?.video_url,
    body?.output?.videoUrl,
    body?.data?.video_url,
    body?.data?.videoUrl,
    body?.data?.output?.video_url,
    body?.data?.output?.videoUrl,
    body?.result?.video_url,
    body?.result?.videoUrl,
    body?.result?.url,
  ];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//.test(value)) || null;
}

function extractProviderStatus(body) {
  const value =
    body?.status ||
    body?.state ||
    body?.data?.status ||
    body?.data?.state ||
    body?.output?.status ||
    "";
  const status = String(value).toLowerCase();
  if (["succeeded", "success", "completed", "done", "finished"].includes(status)) {
    return "completed";
  }
  if (["failed", "error", "canceled", "cancelled", "expired"].includes(status)) {
    return "failed";
  }
  return "processing";
}

export async function submitGeneration({
  prompt,
  mode = "text-to-video",
  videoUrl,
  imageUrls = [],
  instructions = "",
}) {
  if (!prompt) throw new Error("prompt is required.");
  if (mode === "character-replace" && (!videoUrl || imageUrls.length < 1)) {
    throw new Error("Une vidéo source et une référence personnage sont requises.");
  }

  const data = {
    prompt,
    user_prompt: prompt,
    model: MODEL,
    ...(mode === "character-replace"
      ? {
          video_url: videoUrl,
          template: { id: "replace/person_replace" },
          image_urls: imageUrls,
          user_prompt:
            instructions ||
            "Replace the selected source character while preserving motion, timing, camera, lighting and environment.",
        }
      : {}),
  };

  const body = await bytePlusRequest("/api/v1/submit", {
    operator_id: OPERATOR_ID,
    operator_version: OPERATOR_VERSION,
    data,
  });
  const taskId = extractTaskId(body);
  if (!taskId) {
    const error = new Error("BytePlus n’a pas renvoyé de task_id.");
    error.code = "BYTEPLUS_INVALID_RESPONSE";
    throw error;
  }
  return { taskId: String(taskId), provider: body };
}

export async function pollGeneration(taskId) {
  if (!taskId) throw new Error("taskId is required.");
  const body = await bytePlusRequest("/api/v1/poll", {
    operator_id: OPERATOR_ID,
    operator_version: OPERATOR_VERSION,
    task_id: taskId,
  });
  return {
    status: extractProviderStatus(body),
    videoUrl: extractVideoUrl(body),
    provider: body,
  };
}

export { MODEL };