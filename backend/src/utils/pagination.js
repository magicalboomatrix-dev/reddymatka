const MAX_PAGE_LIMIT = 100;

function clampPagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(Math.max(1, parseInt(query.limit) || 20), MAX_PAGE_LIMIT);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function escapeLike(str) {
  return String(str).replace(/[%_\\]/g, '\\$&');
}

module.exports = { clampPagination, escapeLike };
