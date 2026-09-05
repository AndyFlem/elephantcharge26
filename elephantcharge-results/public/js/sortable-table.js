/**
 * Generic click-to-sort behaviour for <table> columns marked with a
 * `data-sort` attribute ("number" or "string") on the <th>. Cells may carry
 * a `data-sort-value` attribute to sort on a raw value distinct from their
 * formatted display text (e.g. metres behind a "12.3 km" label); otherwise
 * the cell's text content is used. Blank values always sort to the bottom,
 * regardless of sort direction.
 */
(function () {
  function cellValue(row, index) {
    var cell = row.children[index];
    if (!cell) return '';
    if (cell.dataset.sortValue !== undefined) return cell.dataset.sortValue.trim();
    return cell.textContent.trim();
  }

  function compare(a, b, type, dir) {
    var aBlank = a === '' || a === '—';
    var bBlank = b === '' || b === '—';
    if (aBlank || bBlank) {
      if (aBlank && bBlank) return 0;
      return aBlank ? 1 : -1;
    }
    var cmp = type === 'number'
      ? parseFloat(a) - parseFloat(b)
      : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    return dir === 'asc' ? cmp : -cmp;
  }

  function makeSortable(table) {
    var headers = Array.prototype.slice.call(table.querySelectorAll('thead th[data-sort]'));
    if (!headers.length) return;

    headers.forEach(function (th) {
      th.classList.add('sortable');
      th.addEventListener('click', function () {
        var index = Array.prototype.indexOf.call(th.parentNode.children, th);
        var type = th.dataset.sort;
        var dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';

        headers.forEach(function (h) {
          delete h.dataset.sortDir;
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.dataset.sortDir = dir;
        th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');

        var tbody = table.tBodies[0];
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (r1, r2) {
          return compare(cellValue(r1, index), cellValue(r2, index), type, dir);
        });
        rows.forEach(function (row) { tbody.appendChild(row); });
      });
    });
  }

  document.querySelectorAll('table').forEach(makeSortable);
})();
