describe("middleware/ensureCa", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("calls next() when CA is initialized", async () => {
    jest.doMock(
      "../src/services/stepCaService",
      () => ({ isInitialized: jest.fn(async () => true) }),
      { virtual: false },
    );
    const ensureCa = require("../src/middleware/ensureCa");

    const req = {};
    const res = {};
    const next = jest.fn();
    await ensureCa(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  test("passes 409 error when CA is not initialized", async () => {
    jest.doMock(
      "../src/services/stepCaService",
      () => ({ isInitialized: jest.fn(async () => false) }),
      { virtual: false },
    );
    const ensureCa = require("../src/middleware/ensureCa");

    const req = {};
    const res = {};
    const next = jest.fn();
    await ensureCa(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err.expose).toBe(true);
    expect(err.message).toContain("not initialized");
  });

  test("propagates unexpected errors", async () => {
    jest.doMock(
      "../src/services/stepCaService",
      () => ({
        isInitialized: jest.fn(async () => {
          throw new Error("boom");
        }),
      }),
      { virtual: false },
    );
    const ensureCa = require("../src/middleware/ensureCa");

    const next = jest.fn();
    await ensureCa({}, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("boom");
  });
});
