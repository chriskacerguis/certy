// src/controllers/adminAcmeController.js
const { db } = require("../services/db");

const TABS = /** @type {const} */ ([
  "orders",
  "accounts",
  "authzs",
  "challenges",
]);

const SORTS = {
  orders: {
    created_at: "o.created_at",
    status: "o.status",
    id: "o.id",
  },
  accounts: {
    created_at: "a.created_at",
    kid: "a.kid",
    id: "a.id",
  },
  authzs: {
    id: "az.id",
    status: "az.status",
    identifier_value: "az.identifier_value",
  },
  challenges: {
    id: "ch.id",
    status: "ch.status",
    validated_at: "ch.validated_at",
  },
};

function normTab(t) {
  t = String(t || "").toLowerCase();
  return TABS.includes(t) ? t : "orders";
}

function normSort(tab, s) {
  s = String(s || "").toLowerCase();
  const map = SORTS[tab];
  return map && map[s] ? s : Object.keys(map)[0];
}

function normDir(d) {
  return String(d || "").toLowerCase() === "asc" ? "asc" : "desc";
}

function pager(total, pageSize, page) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(Math.max(1, page), totalPages);
  const offset = (curPage - 1) * pageSize;
  const win = 3;
  const pages = [];
  const start = Math.max(1, curPage - win);
  const end = Math.min(totalPages, curPage + win);
  for (let i = start; i <= end; i++) pages.push(i);
  return { totalPages, curPage, offset, pages };
}

exports.list = (req, res, next) => {
  try {
    const tab = normTab(req.query.tab);
    const q = String(req.query.q || "").trim();
    const like = `%${q}%`;
    const pageSize = Math.min(
      100,
      Math.max(5, parseInt(req.query.pageSize || "20", 10)),
    );
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const sortBy = normSort(tab, req.query.sortBy);
    const sortDir = normDir(req.query.sortDir);
    const sortExpr = SORTS[tab][sortBy] + " " + sortDir.toUpperCase();

    // Nav counts for badges
    const counts = {
      orders: db.prepare("SELECT COUNT(*) AS c FROM acme_orders").get().c || 0,
      accounts:
        db.prepare("SELECT COUNT(*) AS c FROM acme_accounts").get().c || 0,
      authzs: db.prepare("SELECT COUNT(*) AS c FROM acme_authzs").get().c || 0,
      challenges:
        db.prepare("SELECT COUNT(*) AS c FROM acme_challenges").get().c || 0,
    };

    let total = 0,
      rows = [];

    if (tab === "orders") {
      const where = q
        ? `
        WHERE o.status LIKE @like
           OR o.identifiers_json LIKE @like
           OR a.kid LIKE @like
           OR o.finalize_url LIKE @like
           OR o.cert_url LIKE @like
      `
        : "";
      total =
        db
          .prepare(
            `SELECT COUNT(*) AS c
         FROM acme_orders o JOIN acme_accounts a ON a.id=o.account_id
         ${where}`,
          )
          .get({ like }).c || 0;

      const { totalPages, curPage, offset, pages } = pager(
        total,
        pageSize,
        page,
      );
      rows = db
        .prepare(
          `SELECT o.id, o.status, o.identifiers_json, o.created_at, o.finalize_url, o.cert_url,
                (o.cert_pem IS NOT NULL) AS has_cert,
                a.kid
         FROM acme_orders o JOIN acme_accounts a ON a.id=o.account_id
         ${where}
         ORDER BY ${sortExpr}
         LIMIT @limit OFFSET @offset`,
        )
        .all({ like, limit: pageSize, offset });

      return res.render("admin/acme", {
        csrfToken: req.csrfToken(),
        tab,
        counts,
        rows,
        total,
        page: curPage,
        pageSize,
        pages,
        totalPages,
        q,
        qEnc: encodeURIComponent(q),
        sortBy,
        sortDir,
      });
    }

    if (tab === "accounts") {
      const where = q
        ? `
        WHERE a.kid LIKE @like
           OR IFNULL(a.contact_json,'') LIKE @like
      `
        : "";
      total =
        db
          .prepare(`SELECT COUNT(*) AS c FROM acme_accounts a ${where}`)
          .get({ like }).c || 0;
      const { totalPages, curPage, offset, pages } = pager(
        total,
        pageSize,
        page,
      );
      rows = db
        .prepare(
          `SELECT a.id, a.kid, a.contact_json, a.created_at,
                (SELECT COUNT(*) FROM acme_orders o WHERE o.account_id=a.id) AS orders_count
         FROM acme_accounts a
         ${where}
         ORDER BY ${sortExpr}
         LIMIT @limit OFFSET @offset`,
        )
        .all({ like, limit: pageSize, offset });

      return res.render("admin/acme", {
        csrfToken: req.csrfToken(),
        tab,
        counts,
        rows,
        total,
        page: curPage,
        pageSize,
        pages,
        totalPages,
        q,
        qEnc: encodeURIComponent(q),
        sortBy,
        sortDir,
      });
    }

    if (tab === "authzs") {
      const where = q
        ? `
        WHERE az.identifier_value LIKE @like
           OR az.status LIKE @like
           OR a.kid LIKE @like
      `
        : "";
      total =
        db
          .prepare(
            `SELECT COUNT(*) AS c
         FROM acme_authzs az
         JOIN acme_orders o ON o.id=az.order_id
         JOIN acme_accounts a ON a.id=o.account_id
         ${where}`,
          )
          .get({ like }).c || 0;

      const { totalPages, curPage, offset, pages } = pager(
        total,
        pageSize,
        page,
      );
      rows = db
        .prepare(
          `SELECT az.id, az.order_id, az.identifier_type, az.identifier_value, az.status, az.url,
                o.created_at, a.kid
         FROM acme_authzs az
         JOIN acme_orders o ON o.id=az.order_id
         JOIN acme_accounts a ON a.id=o.account_id
         ${where}
         ORDER BY ${sortExpr}
         LIMIT @limit OFFSET @offset`,
        )
        .all({ like, limit: pageSize, offset });

      return res.render("admin/acme", {
        csrfToken: req.csrfToken(),
        tab,
        counts,
        rows,
        total,
        page: curPage,
        pageSize,
        pages,
        totalPages,
        q,
        qEnc: encodeURIComponent(q),
        sortBy,
        sortDir,
      });
    }

    // challenges
    const where = q
      ? `
      WHERE ch.token LIKE @like
         OR ch.status LIKE @like
         OR az.identifier_value LIKE @like
         OR a.kid LIKE @like
    `
      : "";
    total =
      db
        .prepare(
          `SELECT COUNT(*) AS c
       FROM acme_challenges ch
       JOIN acme_authzs az ON az.id=ch.authz_id
       JOIN acme_orders o ON o.id=az.order_id
       JOIN acme_accounts a ON a.id=o.account_id
       ${where}`,
        )
        .get({ like }).c || 0;

    const { totalPages, curPage, offset, pages } = pager(total, pageSize, page);
    rows = db
      .prepare(
        `SELECT ch.id, ch.authz_id, ch.type, ch.token, ch.status, ch.url, ch.validated_at,
              az.identifier_value, o.id AS order_id, a.kid
       FROM acme_challenges ch
       JOIN acme_authzs az ON az.id=ch.authz_id
       JOIN acme_orders o ON o.id=az.order_id
       JOIN acme_accounts a ON a.id=o.account_id
       ${where}
       ORDER BY ${sortExpr}
       LIMIT @limit OFFSET @offset`,
      )
      .all({ like, limit: pageSize, offset });

    return res.render("admin/acme", {
      csrfToken: req.csrfToken(),
      tab,
      counts,
      rows,
      total,
      page: curPage,
      pageSize,
      pages,
      totalPages,
      q,
      qEnc: encodeURIComponent(q),
      sortBy,
      sortDir,
    });
  } catch (e) {
    next(e);
  }
};
