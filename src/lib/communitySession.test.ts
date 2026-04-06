import {
  buildCommunitySessionId,
  getCommunitySessionId,
  resetCommunitySessionIdForTests,
} from "./communitySession";

describe("communitySession", () => {
  beforeEach(() => {
    resetCommunitySessionIdForTests();
    jest.restoreAllMocks();
  });

  it("builds deterministic session ids from the provided seed values", () => {
    expect(buildCommunitySessionId(1234567890, 0.123456)).toBe(
      "parkpulse-community-kf12oi-2n9c"
    );
  });

  it("caches the generated session id", () => {
    jest.spyOn(Date, "now").mockReturnValue(1710000000000);
    jest.spyOn(Math, "random").mockReturnValue(0.42);

    const firstValue = getCommunitySessionId();
    const secondValue = getCommunitySessionId();

    expect(firstValue).toBe(secondValue);
  });

  it("resets the cached session id between tests", () => {
    jest.spyOn(Date, "now").mockReturnValue(1710000000000);
    jest.spyOn(Math, "random").mockReturnValue(0.1);
    const firstValue = getCommunitySessionId();

    resetCommunitySessionIdForTests();

    jest.spyOn(Date, "now").mockReturnValue(1710000000001);
    jest.spyOn(Math, "random").mockReturnValue(0.2);
    const secondValue = getCommunitySessionId();

    expect(secondValue).not.toBe(firstValue);
  });
});
