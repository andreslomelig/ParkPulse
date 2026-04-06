const SESSION_PREFIX = "parkpulse-community";

let cachedCommunitySessionId: string | null = null;

export function buildCommunitySessionId(
  now = Date.now(),
  randomValue = Math.random()
) {
  const normalizedRandom = Math.floor(randomValue * 1_000_000)
    .toString(36)
    .padStart(4, "0");

  return `${SESSION_PREFIX}-${now.toString(36)}-${normalizedRandom}`;
}

export function getCommunitySessionId() {
  if (!cachedCommunitySessionId) {
    cachedCommunitySessionId = buildCommunitySessionId();
  }

  return cachedCommunitySessionId;
}

export function resetCommunitySessionIdForTests() {
  cachedCommunitySessionId = null;
}
