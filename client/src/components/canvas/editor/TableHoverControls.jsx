import { useState, useEffect } from 'react';

/**
5:  * TableHoverControls — Displays hover-triggered controls on table borders to quickly
6:  * insert rows (bottom border) or columns (right border) using standard TipTap commands.
7:  */
export default function TableHoverControls({ editor, containerRef }) {
  const [hoveredTable, setHoveredTable] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [activeAxis, setActiveAxis] = useState('row'); // 'row' or 'col'
  const [btnX, setBtnX] = useState(0);
  const [btnY, setBtnY] = useState(0);
  const [dotX, setDotX] = useState(0);
  const [dotY, setDotY] = useState(0);
  const [tooltip, setTooltip] = useState('Insert row');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e) => {
      if (!editor || !editor.isEditable) {
        setIsVisible(false);
        return;
      }

      const target = e.target;
      const tableEl = target.closest('.ProseMirror table');
      
      if (!tableEl) {
        // Prevent hiding if the mouse is currently hovering our controls
        if (target.closest('.table-hover-control-btn') || target.closest('.table-hover-control-dot')) {
          return;
        }
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

      // Calculate column right boundary offsets relative to the table
      const colEdges = firstRowCells.map(cell => {
        const cellRect = cell.getBoundingClientRect();
        return cellRect.right - rect.left;
      });

      // Calculate row bottom boundary offsets relative to the table
      const rowEdges = rows.map(row => {
        const rowRect = row.getBoundingClientRect();
        return rowRect.bottom - rect.top;
      });

      // Use internal boundaries or center fallback if 1 column/row
      const verticalLines = colEdges.length > 1 ? colEdges.slice(0, -1) : [rect.width / 2];
      const horizontalLines = rowEdges.length > 1 ? rowEdges.slice(0, -1) : [rect.height / 2];

      // Nearest column line
      let nearestColIdx = 0;
      let minColDist = Infinity;
      verticalLines.forEach((x, idx) => {
        const dist = Math.abs(x - mouseX);
        if (dist < minColDist) {
          minColDist = dist;
          nearestColIdx = idx;
        }
      });
      const targetX = verticalLines[nearestColIdx];

      // Nearest row line
      let nearestRowIdx = 0;
      let minRowDist = Infinity;
      horizontalLines.forEach((y, idx) => {
        const dist = Math.abs(y - mouseY);
        if (dist < minRowDist) {
          minRowDist = dist;
          nearestRowIdx = idx;
        }
      });
      const targetY = horizontalLines[nearestRowIdx];

      // Distance to bottom vs right borders
      const distBottom = Math.abs(rect.height - mouseY);
      const distRight = Math.abs(rect.width - mouseX);

      // Threshold: only show within 120px boundary range for mouse comfort
      const maxDistance = 120;
      if (distBottom > maxDistance && distRight > maxDistance) {
        setIsVisible(false);
        return;
      }

      const isBottomActive = distBottom < distRight;

      if (isBottomActive) {
        setActiveAxis('row');
        setBtnX(tableLeft + targetX);
        setBtnY(tableTop + rect.height);
        setTooltip('Insert row');

        setDotX(tableLeft + rect.width);
        setDotY(tableTop + targetY);
      } else {
        setActiveAxis('col');
        setBtnX(tableLeft + rect.width);
        setBtnY(tableTop + targetY);
        setTooltip('Insert column');

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

  const handleBtnClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hoveredTable || !editor) return;

    if (activeAxis === 'row') {
      const rows = hoveredTable.querySelectorAll('tr');
      const lastRow = rows[rows.length - 1];
      const targetCell = lastRow?.querySelector('td, th');
      if (targetCell) {
        try {
          const pos = editor.view.posAtDOM(targetCell, 0);
          editor.chain().focus().setTextSelection(pos).addRowAfter().run();
        } catch (err) {
          console.error('Failed using posAtDOM:', err);
          editor.chain().focus().addRowAfter().run();
        }
      }
    } else {
      const rows = hoveredTable.querySelectorAll('tr');
      const targetCell = rows[0]?.querySelector('td:last-child, th:last-child');
      if (targetCell) {
        try {
          const pos = editor.view.posAtDOM(targetCell, 0);
          editor.chain().focus().setTextSelection(pos).addColumnAfter().run();
        } catch (err) {
          console.error('Failed using posAtDOM:', err);
          editor.chain().focus().addColumnAfter().run();
        }
      }
    }

    // Hide controls momentarily to refresh position
    setIsVisible(false);
    setHoveredTable(null);
  };

  return (
    <>
      {/* Active button with tooltip */}
      <div
        className="table-hover-control-btn"
        style={{
          position: 'absolute',
          left: `${btnX}px`,
          top: `${btnY}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
        }}
        onClick={handleBtnClick}
      >
        <div className="table-hover-control-btn-circle">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2.5V9.5M2.5 6H9.5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="table-hover-control-tooltip">
          {tooltip}
        </div>
      </div>

      {/* Inactive helper dot */}
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
