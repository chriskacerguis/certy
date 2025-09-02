const request = require("supertest");
const path = require("path");
const fs = require("fs");

// Slower CI runners need more time; also speed up keygen via smaller bits
jest.setTimeout(120000);

describe("adminController routes", () => {
  const origEnv = process.env;
  const origCwd = process.cwd();
  const TMP = path.join(process.cwd(), ".tmp-admin");

  beforeEach(() => {
    process.env = {
      ...origEnv,
      MIGRATIONS_DIR: path.join(origCwd, "src", "migrations"),
      CA_ROOT_KEY_BITS: "1024",
      CA_INT_KEY_BITS: "1024",
    };
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(TMP, { recursive: true });
    process.chdir(TMP);
    jest.resetModules();
  });

  afterEach(() => {
    process.env = origEnv;
    process.chdir(origCwd);
  });

  test("lists certs and supports pagination and search", async () => {
    const app = require("../src/app");
    const step = require("../src/services/stepCaService");

    // init CA
    await step.initCA({ commonName: "Test Root" });

    // issue a few certs
    const agent = request.agent(app);
    const issuePage = await agent.get("/certs/new").expect(200);
    const csrf = /name="_csrf" value="([^"]+)"/.exec(issuePage.text)[1];

    for (let i = 0; i < 3; i++) {
      const res = await agent
        .post("/certs/issue")
        .type("form")
        .send({
          _csrf: csrf,
          commonName: `example${i}.com`,
          sans: `www.example${i}.com`,
          keyType: "RSA",
          days: 30,
        })
        .expect(200);
      expect(res.headers["content-type"]).toContain("application/zip");
    }

    // list page 1
    const list1 = await agent.get("/admin/certs?page=1&pageSize=2").expect(200);
    expect(list1.text).toContain("Certificates");
    // has two entries
    const rows1 = (list1.text.match(/<tr>/g) || []).length;
    expect(rows1).toBeGreaterThanOrEqual(2);

    // search
    const search = await agent.get("/admin/certs?q=example3.com").expect(200);
    expect(search.text).toContain("example3.com");

    // sort
    const sorted = await agent
      .get("/admin/certs?sortBy=cn&sortDir=asc")
      .expect(200);
    expect(sorted.text).toContain("example0.com");
  });
});
