import React, { useState } from "react";
import { FolderPlus, Plus } from "lucide-react";

export default function CategoryHeader({ onCreateCategory }) {
  return (
    <div className="sidebar-section-header mt-1 relative">
      <div 
        className="sidebar-section-toggle" 
        style={{ cursor: "default" }}
      >
        <span className="sidebar-section-icon-wrapper">
          <FolderPlus size={15} />
        </span>
        <span className="sidebar-section-title">Category</span>
      </div>
      <div className="relative">
        <button
          onClick={onCreateCategory}
          className="sidebar-section-add"
          title="Create Category"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
