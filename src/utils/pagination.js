function getPagination(query) {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paged(data, total, page, limit) {
  return {
    data,
    pagination: {
      page,
      limit,
      total: Number(total || 0),
      totalPages: Math.ceil(Number(total || 0) / limit),
    },
  };
}

module.exports = { getPagination, paged };
