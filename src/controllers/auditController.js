// src/controllers/auditController.js
const { db } = require('../services/db');

const ALLOWED_SORT = {
  ts: 'ts',
  type: 'type',
  id: 'id',
  user_name: 'user_name',
  user_email: 'user_email',
  ip: 'ip'
};

exports.listAudit = (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '').trim();
  const userQ = String(req.query.user || '').trim();
  const ip = String(req.query.ip || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize || '20', 10)));

    const sortByReq = String(req.query.sortBy || 'ts');
    const sortBy = ALLOWED_SORT[sortByReq] ? sortByReq : 'ts';
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const order = `${ALLOWED_SORT[sortBy]} ${sortDir.toUpperCase()}`;

    const filters = [];
    const params = {};

    if (q) {
      filters.push(`(details_json LIKE @like)`);
      params.like = `%${q}%`;
    }
    if (type) {
      filters.push(`type = @type`);
      params.type = type;
    }
    if (userQ) {
      filters.push(`(IFNULL(user_name,'') LIKE @user OR IFNULL(user_email,'') LIKE @user)`);
      params.user = `%${userQ}%`;
    }
    if (ip) {
      filters.push(`IFNULL(ip,'') LIKE @ip`);
      params.ip = `%${ip}%`;
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM audit_logs ${where}`).get(params);
    const total = countRow.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const curPage = Math.min(page, totalPages);
    const offset = (curPage - 1) * pageSize;

    const rows = db.prepare(
      `SELECT id, ts, type, details_json, user_id, user_name, user_email, ip
       FROM audit_logs
       ${where}
       ORDER BY ${order}
       LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit: pageSize, offset });

    // gather types for a filter dropdown
    const types = db.prepare('SELECT DISTINCT type FROM audit_logs ORDER BY type ASC').all().map(r => r.type);

    const pages = [];
    const win = 3;
    const start = Math.max(1, curPage - win);
    const end = Math.min(totalPages, curPage + win);
    for (let i = start; i <= end; i++) pages.push(i);

    res.render('admin-audit', {
      csrfToken: req.csrfToken(),
      rows,
      total,
      totalPages,
      page: curPage,
      pageSize,
      pages,
      q,
      qEnc: encodeURIComponent(q),
      type,
  userQ,
      ip,
      sortBy,
      sortDir,
      types
    });
  } catch (e) { next(e); }
};
