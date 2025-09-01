// src/controllers/adminController.js
const { db } = require('../services/db');

const ALLOWED_SORT = {
  serial_hex: 'c.serial_hex',
  subject_cn: 'c.subject_cn',
  not_before: 'c.not_before',
  not_after: 'c.not_after',
  renewed_from: 'c.renewed_from',
  revoked_at: 'r.revoked_at'
};

exports.listCerts = (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize || '20', 10)));

    const sortByReq = String(req.query.sortBy || 'not_after');
    const sortBy = ALLOWED_SORT[sortByReq] ? sortByReq : 'not_after';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const order = `${ALLOWED_SORT[sortBy]} ${sortDir.toUpperCase()}`;

    const like = `%${q}%`;
    const where = q
      ? `WHERE c.serial_hex LIKE @like
         OR c.subject_cn LIKE @like
         OR c.subject LIKE @like
         OR c.sans_json LIKE @like
         OR IFNULL(r.reason,'') LIKE @like`
      : '';

    const countRow = db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM certs c
       LEFT JOIN revocations r ON r.serial_hex = c.serial_hex
       ${where}`
    ).get({ like });

    const total = countRow.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const curPage = Math.min(page, totalPages);
    const offset = (curPage - 1) * pageSize;

    const rows = db.prepare(
      `SELECT c.serial_hex, c.subject_cn, c.subject, c.sans_json,
              c.not_before, c.not_after, c.renewed_from,
              r.revoked_at, r.reason
       FROM certs c
       LEFT JOIN revocations r ON r.serial_hex = c.serial_hex
       ${where}
       ORDER BY ${order}
       LIMIT @limit OFFSET @offset`
    ).all({ like, limit: pageSize, offset });

    // Small pager window (up to 7 buttons)
    const pages = [];
    const win = 3;
    const start = Math.max(1, curPage - win);
    const end = Math.min(totalPages, curPage + win);
    for (let i = start; i <= end; i++) pages.push(i);

  res.render('admin/certs', {
      csrfToken: req.csrfToken(),
      rows,
      total,
      totalPages,
      page: curPage,
      pageSize,
      pages,
      q,
      qEnc: encodeURIComponent(q),
      sortBy,
      sortDir
    });
  } catch (e) {
    next(e);
  }
};
