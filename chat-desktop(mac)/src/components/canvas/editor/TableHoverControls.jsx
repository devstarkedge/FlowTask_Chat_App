import { useState, useEffect, useRef } from 'react';

/**
 * Displays hover-triggered controls on table borders.
 *
 * - Bottom border: "Insert row" (blue +) and "Delete row" (red −) buttons
 * - Right border:  "Insert column" (blue +) and "Delete column" (red −) buttons
 */
export default function TableHoverControls({ editor, containerRef }) {
  const [hoveredTable, setHoveredTable] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [activeAxis, setActiveAxis] = useState('row'); // 'row' | 'col'
  const tableRef = useRef(null);
  const deleteRef = useRef(null);
  const pressedTableRef = useRef(null);
  const [cross, setCross] = useState({ x: 0, y: 0 });

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

    const positionCross = table => {
      if (!table || !container.contains(table)) return false;
      const rect = table.getBoundingClientRect();
      const wrapper = table.closest('.tableWrapper')?.getBoundingClientRect() || rect;
      const host = container.getBoundingClientRect();
      let top = 0, bottom = window.innerHeight, right = window.innerWidth;
      for (let parent = container.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflow + getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect();
        top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); right = Math.min(right, bounds.right);
      }
      if (rect.bottom <= top || rect.top >= bottom) return false;
      const edge = Math.min(rect.right, wrapper.right);
      const sideRoom = edge + 40 <= right;
      setCross({ x: (sideRoom ? edge + 4 : Math.min(edge, right) - 40) - host.left,
        y: Math.max(top, Math.min(sideRoom ? rect.top : rect.top - 40, bottom - 36)) - host.top });
      return true;
    };
    const selectedTable = () => {
      const selection = editor?.state.selection;
      for (let depth = selection?.$from.depth || 0; depth > 0; depth--) {
        if (selection.$from.node(depth).type.name !== 'table') continue;
        const dom = editor.view.nodeDOM(selection.$from.before(depth));
        return dom?.matches?.('table') ? dom : dom?.querySelector?.('table');
      }
      return null;
    };
    const inControlRegion = event => {
      const table = tableRef.current;
      if (!table || !container.contains(table)) return false;
      const bounds = table.closest('.tableWrapper')?.getBoundingClientRect() || table.getBoundingClientRect();
      const button = deleteRef.current?.getBoundingClientRect();
      return button && event.clientX >= Math.min(bounds.left, button.left) && event.clientX <= Math.max(bounds.right, button.right)
        && event.clientY >= Math.min(bounds.top, button.top) && event.clientY <= Math.max(bounds.bottom, button.bottom);
    };

    const handleMouseMove = (e) => {
      if (!editor || !editor.isEditable) {
        setIsVisible(false);
        setHoveredTable(null);
        return;
      }

      const target = e.target;
      if (!(target instanceof Element)) return;

      // Don't hide when hovering our own control buttons
      if (
        target.closest('.table-hover-control-btn') ||
        target.closest('.table-hover-control-dot') || target.closest('.canvas-table-delete')
      ) {
        return;
      }

      const tableEl = target.closest('.ProseMirror table');

      if (!tableEl || !container.contains(tableEl)) {
        if (inControlRegion(e) || pressedTableRef.current) return;
        setIsVisible(false);
        const selected = selectedTable();
        if (selected && positionCross(selected)) { tableRef.current = selected; setHoveredTable(selected); }
        else setHoveredTable(null);
        return;
      }

      setHoveredTable(tableEl);
      tableRef.current = tableEl;
      setIsVisible(true);

      const rect = tableEl.getBoundingClientRect();
      const wrapperRect = tableEl.closest('.tableWrapper')?.getBoundingClientRect() || rect;
      const visibleLeft = Math.max(rect.left, wrapperRect.left);
      const visibleRight = Math.min(rect.right, wrapperRect.right);
      const containerRect = container.getBoundingClientRect();

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const tableTop = rect.top - containerRect.top;
      const tableLeft = rect.left - containerRect.left;
      positionCross(tableEl);

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
      const visibleColumns = colEdges.slice(0, -1).filter(x => rect.left + x >= visibleLeft + 12 && rect.left + x <= visibleRight - 40);
      const verticalLines = visibleColumns.length ? visibleColumns : [(visibleLeft + visibleRight) / 2 - rect.left];
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
      const distRight = Math.abs(visibleRight - e.clientX);

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
        setDotX(visibleRight - containerRect.left);
        setDotY(tableTop + targetY);
      } else {
        // ── Column axis: buttons sit to the right of the table ──────────
        setActiveAxis('col');

        // Insert (+) centered at nearest row separator, right of table
        const controlY = Math.max(12, Math.min(targetY, rect.height - GAP - 12));
        setInsertX(visibleRight - containerRect.left);
        setInsertY(tableTop + controlY);

        // Delete (−) just below insert
        setDeleteX(visibleRight - containerRect.left);
        setDeleteY(tableTop + controlY + GAP);

        // Dot on bottom border at nearest column separator
        setDotX(tableLeft + targetX);
        setDotY(tableTop + rect.height);
      }
    };

    const handleMouseLeave = event => {
      if (event && (inControlRegion(event) || (event.relatedTarget instanceof Node && deleteRef.current?.contains(event.relatedTarget)) || pressedTableRef.current)) return;
      setIsVisible(false);
      const selected = selectedTable();
      if (selected && positionCross(selected)) { tableRef.current = selected; setHoveredTable(selected); }
      else setHoveredTable(null);
    };
    const handleSelection = () => {
      const selection = editor?.state.selection;
      if (!editor?.isEditable || !selection) return handleMouseLeave();
      for (let depth = selection.$from.depth; depth > 0; depth--) {
        if (selection.$from.node(depth).type.name !== 'table') continue;
        const dom = editor.view.nodeDOM(selection.$from.before(depth));
        const table = dom?.matches?.('table') ? dom : dom?.querySelector?.('table');
        if (!table) return handleMouseLeave();
        tableRef.current = table; setHoveredTable(table);
        if (!positionCross(table)) setHoveredTable(null);
        return;
      }
      handleMouseLeave();
    };

    const handleScroll = () => {
      setIsVisible(false);
      if (tableRef.current && positionCross(tableRef.current)) return;
      setHoveredTable(null);
    };
    const handlePointerUp = event => {
      if (deleteRef.current?.contains(event.target)) return;
      pressedTableRef.current = null;
      handleMouseLeave(event);
    };
    document.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    editor?.on('selectionUpdate', handleSelection);
    editor?.on('update', handleScroll);
    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      editor?.off('selectionUpdate', handleSelection);
      editor?.off('update', handleScroll);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [editor, containerRef]);

  const crossButton = hoveredTable && editor?.isEditable ? <button
    ref={deleteRef}
    type="button" className="canvas-table-delete" aria-label="Delete table" title="Delete entire table"
    style={{ position: 'absolute', left: cross.x, top: cross.y, width: 36, height: 36, zIndex: 51, pointerEvents: 'auto', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
    onPointerDown={event => { event.preventDefault(); event.stopPropagation(); pressedTableRef.current = tableRef.current; }}
    onPointerCancel={() => { pressedTableRef.current = null; }}
    onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
    onClick={event => {
      event.preventDefault(); event.stopPropagation();
      const table = pressedTableRef.current || hoveredTable;
      pressedTableRef.current = null;
      const paragraph = table?.querySelector('td p, th p');
      if (!paragraph || !editor.view.dom.contains(table)) return;
      const pos = editor.view.posAtDOM(paragraph, 0);
      editor.chain().focus().setTextSelection(pos).deleteTable().run();
      setHoveredTable(null); setIsVisible(false); tableRef.current = null;
    }}>×</button> : null;
  if (!isVisible) return crossButton;

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
      {crossButton}
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
