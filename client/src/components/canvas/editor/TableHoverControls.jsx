import { useState, useEffect } from 'react';

/**
 * TableHoverControls — Displays hover-triggered controls on table borders.
 *
 * - Bottom border: "Insert row" (blue +) and "Delete row" (red −) buttons
 * - Right border:  "Insert column" (blue +) and "Delete column" (red −) buttons
 */
export default function TableHoverControls({ editor, containerRef }) {
  const [hoveredTable, setHoveredTable] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [activeAxis, setActiveAxis] = useState('row'); // 'row' | 'col'

  // Insert button position (bottom/right border)
  const [insertX, setInsertX] = useState(0);
  const [insertY, setInsertY] = useState(0);

  // Delete button position — beside the insert button
  const [deleteX, setDeleteX] = useState(0);
  const [deleteY, setDeleteY] = useState(0);

  // Inactive axis dot position
  const [dotX, setDotX] = useState(0);
  const [dotY, setDotY] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e) => {
      if (!editor || !editor.isEditable) {
        setIsVisible(false);
        return;
      }

      const target = e.target;

      // Don't hide when hovering our own control buttons
      if (
        target.closest('.table-hover-control-btn') ||
        target.closest('.table-hover-control-dot')
      ) {
        return;
      }

      const tableEl = target.closest('.ProseMirror table');

      if (!tableEl) {
        setIsVisible(false);
        setHoveredTable(null);
        return;
      }

      setHoveredTable(tableEl);
      setIsVisible(true);

      const rect = tableEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const tableTop = rect.top - containerRect.top;
      const tableLeft = rect.left - containerRect.left;

      const rows = Array.from(tableEl.querySelectorAll('tr'));
      if (rows.length === 0) return;

      const firstRowCells = Array.from(rows[0].querySelectorAll('td, th'));

      // Column right‑edge offsets (relative to table left)
      const colEdges = firstRowCells.map((cell) => {
        const cellRect = cell.getBoundingClientRect();
        return cellRect.right - rect.left;
      });

      // Row bottom‑edge offsets (relative to table top)
      const rowEdges = rows.map((row) => {
        const rowRect = row.getBoundingClientRect();
        return rowRect.bottom - rect.top;
      });

      // Internal separator lines (exclude last edge = table border)
      const verticalLines = colEdges.length > 1 ? colEdges.slice(0, -1) : [rect.width / 2];
      const horizontalLines = rowEdges.length > 1 ? rowEdges.slice(0, -1) : [rect.height / 2];

      // Nearest column separator to mouse X
      let nearestColIdx = 0;
      let minColDist = Infinity;
      verticalLines.forEach((x, idx) => {
        const dist = Math.abs(x - mouseX);
        if (dist < minColDist) { minColDist = dist; nearestColIdx = idx; }
      });
      const targetX = verticalLines[nearestColIdx];

      // Nearest row separator to mouse Y
      let nearestRowIdx = 0;
      let minRowDist = Infinity;
      horizontalLines.forEach((y, idx) => {
        const dist = Math.abs(y - mouseY);
        if (dist < minRowDist) { minRowDist = dist; nearestRowIdx = idx; }
      });
      const targetY = horizontalLines[nearestRowIdx];

      // Distance to bottom vs right outer border
      const distBottom = Math.abs(rect.height - mouseY);
      const distRight = Math.abs(rect.width - mouseX);

      // Only show within 120 px of an outer border
      const maxDistance = 120;
      if (distBottom > maxDistance && distRight > maxDistance) {
        setIsVisible(false);
        return;
      }

      const isBottomActive = distBottom < distRight;
      // Offset between insert and delete buttons (px)
      const GAP = 28;

      if (isBottomActive) {
        // ── Row axis: buttons sit below the table ───────────────────────
        setActiveAxis('row');

        // Insert (+) centered at nearest column separator, below table
        setInsertX(tableLeft + targetX);
        setInsertY(tableTop + rect.height);

        // Delete (−) just to the right of insert
        setDeleteX(tableLeft + targetX + GAP);
        setDeleteY(tableTop + rect.height);

        // Dot on right border at nearest row separator
        setDotX(tableLeft + rect.width);
        setDotY(tableTop + targetY);
      } else {
        // ── Column axis: buttons sit to the right of the table ──────────
        setActiveAxis('col');

        // Insert (+) centered at nearest row separator, right of table
        setInsertX(tableLeft + rect.width);
        setInsertY(tableTop + targetY);

        // Delete (−) just below insert
        setDeleteX(tableLeft + rect.width);
        setDeleteY(tableTop + targetY + GAP);

        // Dot on bottom border at nearest column separator
        setDotX(tableLeft + targetX);
        setDotY(tableTop + rect.height);
      }
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
      setHoveredTable(null);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor, containerRef]);

  if (!isVisible) return null;

  // ── Helpers ─────────────────────────────────────────────────────────────

  const focusCell = (tableEl, selector) => {
    const cell = tableEl?.querySelector(selector);
    if (!cell || !editor) return false;
    try {
      const pos = editor.view.posAtDOM(cell, 0);
      editor.chain().focus().setTextSelection(pos).run();
      return true;
    } catch {
      editor.chain().focus().run();
      return false;
    }
  };

  const handleInsertClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hoveredTable || !editor) return;

    if (activeAxis === 'row') {
      const rows = hoveredTable.querySelectorAll('tr');
      const lastRow = rows[rows.length - 1];
      focusCell(lastRow, 'td, th');
      editor.chain().focus().addRowAfter().run();
    } else {
      const rows = hoveredTable.querySelectorAll('tr');
      focusCell(rows[0], 'td:last-child, th:last-child');
      editor.chain().focus().addColumnAfter().run();
    }

    setIsVisible(false);
    setHoveredTable(null);
  };

  const handleDeleteClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hoveredTable || !editor) return;

    if (activeAxis === 'row') {
      // Delete the row closest to the mouse (last non‑header row as a sensible default)
      const rows = hoveredTable.querySelectorAll('tr');
      const targetRow = rows[rows.length - 1];
      const cell = targetRow?.querySelector('td, th');
      if (cell) {
        try {
          const pos = editor.view.posAtDOM(cell, 0);
          editor.chain().focus().setTextSelection(pos).deleteRow().run();
        } catch {
          editor.chain().focus().deleteRow().run();
        }
      }
    } else {
      // Delete the column closest to the mouse (last column as a sensible default)
      const rows = hoveredTable.querySelectorAll('tr');
      const cell = rows[0]?.querySelector('td:last-child, th:last-child');
      if (cell) {
        try {
          const pos = editor.view.posAtDOM(cell, 0);
          editor.chain().focus().setTextSelection(pos).deleteColumn().run();
        } catch {
          editor.chain().focus().deleteColumn().run();
        }
      }
    }

    setIsVisible(false);
    setHoveredTable(null);
  };

  const insertLabel = activeAxis === 'row' ? 'Insert row' : 'Insert column';
  const deleteLabel = activeAxis === 'row' ? 'Delete row' : 'Delete column';

  return (
    <>
      {/* ── Insert button (blue +) ────────────────────────────────── */}
      <div
        className="table-hover-control-btn"
        style={{
          position: 'absolute',
          left: `${insertX}px`,
          top: `${insertY}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
        }}
        onClick={handleInsertClick}
      >
        <div className="table-hover-control-btn-circle table-hover-control-btn-insert">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2.5V9.5M2.5 6H9.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="table-hover-control-tooltip">{insertLabel}</div>
      </div>

      {/* ── Delete button (red −) ─────────────────────────────────── */}
      <div
        className="table-hover-control-btn"
        style={{
          position: 'absolute',
          left: `${deleteX}px`,
          top: `${deleteY}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
        }}
        onClick={handleDeleteClick}
      >
        <div className="table-hover-control-btn-circle table-hover-control-btn-delete">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6H9.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="table-hover-control-tooltip">{deleteLabel}</div>
      </div>

      {/* ── Inactive axis dot ─────────────────────────────────────── */}
      <div
        className="table-hover-control-dot"
        style={{
          position: 'absolute',
          left: `${dotX}px`,
          top: `${dotY}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 49,
        }}
      />
    </>
  );
}
