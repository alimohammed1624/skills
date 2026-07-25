// Dashboard metrics API
const DEFAULT_PAGE_SIZE = 25;

async function getMetrics(db, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const offset = (page - 1) * pageSize;
  const rows = await db.query(
    'SELECT * FROM metrics ORDER BY recorded_at DESC LIMIT ? OFFSET ?',
    [pageSize, offset]
  );
  const [{ count }] = await db.query('SELECT COUNT(*) as count FROM metrics');

  return {
    data: rows,
    page,
    pageSize,
    totalPages: Math.ceil(count / pageSize),
  };
}

module.exports = { getMetrics };
