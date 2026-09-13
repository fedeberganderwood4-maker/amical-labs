function normalizeUserId(value) {
  if (typeof value !== "string") return null;
  const userId = value.trim();
  if (!userId || userId.length > 160 || !/^[a-zA-Z0-9_.:@/-]+$/.test(userId)) return null;
  return userId;
}

export function getAuthenticatedUser(req) {
  // These properties are intentionally adapter points for the existing auth middleware.
  const middlewareUserId =
    req.user?.id ||
    req.auth?.userId ||
    req.auth?.user?.id ||
    req.session?.user?.id;
  const middlewareUser = normalizeUserId(middlewareUserId);
  if (middlewareUser) return { id: middlewareUser, source: "auth-middleware" };

  // Only trust a user header when an upstream authenticated proxy explicitly opts in.
  if (process.env.AMICAL_TRUSTED_USER_HEADER === "true") {
    const headerUser = normalizeUserId(req.get("x-amical-user-id"));
    if (headerUser) return { id: headerUser, source: "trusted-proxy" };
  }

  // Local development is opt-in and never enabled by default.
  if (process.env.NODE_ENV !== "production") {
    const developmentUser = normalizeUserId(process.env.AMICAL_DEV_USER_ID);
    if (developmentUser) return { id: developmentUser, source: "development" };
  }
  return null;
}

export function requireUser(req, res, next) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({
      error: "Authentification requise.",
      code: "AUTHENTICATION_REQUIRED",
    });
  }
  req.currentUser = user;
  return next();
}