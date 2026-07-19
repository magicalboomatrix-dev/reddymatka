import { useState, useMemo } from 'react';

export default function PaginatedTable({
  data,
  columns,
  emptyMessage = 'No data available',
  rowsPerPage = 10,
  maxHeight = '400px',
  className = '',
  headerClassName = '',
  rowClassName = '',
}) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(data.length / rowsPerPage);
  
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return data.slice(start, start + rowsPerPage);
  }, [data, currentPage, rowsPerPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset to page 1 when data changes
  useMemo(() => {
    setCurrentPage(1);
  }, [data.length]);

  if (data.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-gray-400 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Table Container with max height and scroll */}
      <div 
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <table className="w-full text-sm">
          <thead className={`bg-gray-50 sticky top-0 z-10 ${headerClassName}`}>
            <tr>
              {columns.map((col, idx) => (
                <th 
                  key={idx} 
                  className={`px-3 py-3 font-medium text-gray-600 text-xs ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginatedData.map((row, rowIdx) => (
              <tr key={row.id || rowIdx} className={`hover:bg-gray-50 ${rowClassName}`}>
                {columns.map((col, colIdx) => (
                  <td 
                    key={colIdx} 
                    className={`px-3 py-3 ${col.cellClass || ''}`}
                  >
                    {col.render ? col.render(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50">
          <div className="text-xs text-gray-500">
            Showing {((currentPage - 1) * rowsPerPage) + 1} - {Math.min(currentPage * rowsPerPage, data.length)} of {data.length}
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed rounded"
            >
              ← Prev
            </button>
            
            {/* Page Numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Show window of 5 pages around current page
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`min-w-[28px] px-2 py-1 text-xs border rounded ${
                      currentPage === pageNum 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-xs border bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed rounded"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
