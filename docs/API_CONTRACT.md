# AMICAL LABS API contract

All user-scoped endpoints require the current authenticated user. The server accepts an existing `req.user.id`, `req.auth.userId`, or `req.session.user.id`; a trusted proxy header is opt-in only. BytePlus credentials are server-only.

## POST /api/video/generate

Request:
{
  "prompt": "cinematic shot of a futuristic city in the rain",
  "mode": "text-to-video",
  "requestId": "client-generated-idempotency-key"
}

Server responsibilities:
- authenticate current user;
- validate and bound the prompt;
- verify available credits and reserve them atomically;
- create a generation record with `queued` status;
- call BytePlus `las_video_edit_enhance`;
- return the task id;
- never expose BytePlus credentials.

The server returns `202` with:

{
  "taskId": "provider-task-id",
  "generation": {
    "user_id": "existing-user-id",
    "task_id": "provider-task-id",
    "prompt": "…",
    "model": "configured-model",
    "status": "processing",
    "credits_used": 25
  }
}

## POST /api/video/replace-character

This backward-compatible route delegates to `/api/video/generate` with `mode: "character-replace"`.

Request:
{
  "videoUrl": "public-or-storage-url",
  "characterId": "existing-character-id",
  "imageUrls": ["face-url", "back-url", "profile-url"],
  "prompt": "description of the character to replace",
  "instructions": "optional user instructions"
}

## GET /api/video/generation/:taskId

Server responsibilities:
- poll BytePlus;
- normalize status to `queued | processing | completed | failed`;
- save the final video URL when completed;
- update only the generation owned by the authenticated user;
- refund a failed reservation once;
- return normalized status to the frontend.

## GET /api/video/history

Returns only generations owned by the authenticated user.

## GET /api/credits

Returns the current server-side credit balance. The browser must never calculate or mutate this balance.
