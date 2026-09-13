// AMICAL LABS video API client.
// BytePlus credentials never cross this boundary: the browser only calls AMICAL routes.

async function readResponse(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || fallback);
    error.code = body.code;
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export async function getSession() {
  const response = await fetch("/api/session");
  return readResponse(response, "Impossible de vérifier la session.");
}

export async function getCredits() {
  const response = await fetch("/api/credits");
  return readResponse(response, "Impossible de récupérer le solde.");
}

export async function listGenerations() {
  const response = await fetch("/api/video/history");
  return readResponse(response, "Impossible de récupérer l’historique.");
}

export async function createVideoGeneration(payload) {
  const response = await fetch("/api/video/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readResponse(response, "Impossible de démarrer la génération.");
}

// Existing character-replacement integration kept for compatibility.
export async function createCharacterReplacement(payload) {
  const response = await fetch("/api/video/replace-character", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readResponse(response, "Impossible de démarrer le remplacement.");
}

export async function getGeneration(taskId) {
  const response = await fetch(`/api/video/generation/${encodeURIComponent(taskId)}`);
  return readResponse(response, "Impossible de récupérer la génération.");
}