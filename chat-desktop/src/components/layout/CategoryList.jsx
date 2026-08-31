import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, MoreVertical } from "lucide-react";
import SidebarSection from "./sidebar/SidebarSection";
import SidebarItem from "./sidebar/SidebarItem";
import ChannelListItem from "./sidebar/ChannelListItem";


const CategoryGroup = ({
  category,
  categoryChannels,
  expanded,
  onToggle,
  isLaterPage,
  activeChannelId,
  unreads,
  handleSelectChannel,
  hasDraft,
  setCategoryToEdit,
  setChannelToMove,
  handleDeleteCategory,
  activeCategoryMenu,
  setActiveCategoryMenu,
  sortChannels,
}) => {
  const isMenuOpen = activeCategoryMenu === category._id;
  const btnRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  const handleOpenMenu = (e) => {
    e.stopPropagation();
    if (!isMenuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setActiveCategoryMenu(isMenuOpen ? null : category._id);
  };

  const actionMenu = (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpenMenu}
        className="sidebar-section-add"
        title="Category Options"
      >
        <MoreVertical size={16} />
      </button>
      {isMenuOpen && createPortal(
        <div
          className="z-[9999] bg-[#2C2D30] rounded-md shadow-lg border border-[#3C3D40] py-1 text-sm text-[#D1D2D3]"
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right, minWidth: "160px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left hover:bg-[#3584E4] hover:text-white transition-colors"
            style={{ padding: "8px 16px" }}
            onClick={() => { setCategoryToEdit(category); setActiveCategoryMenu(null); }}
          >
            Edit / Change Type
          </button>
          {category.type === 'custom' && (
            <button
              className="w-full text-left hover:bg-[#3584E4] hover:text-white transition-colors"
              style={{ padding: "8px 16px" }}
              onClick={() => { setChannelToMove({ categoryId: category._id }); setActiveCategoryMenu(null); }}
            >
              Add Channels
            </button>
          )}
          <button
            className="w-full text-left hover:bg-[#E01E5A] hover:text-white transition-colors"
            style={{ padding: "8px 16px" }}
            onClick={() => { handleDeleteCategory(category._id); setActiveCategoryMenu(null); }}
          >
            Delete Category
          </button>
        </div>,
        document.body
      )}
    </div>
  );

  return (
    <SidebarSection
      key={`cat_${category._id}`}
      title={`${category.icon || '📁'} ${category.name}`}
      count={categoryChannels.length}
      expanded={expanded}
      onToggle={onToggle}
      actionMenu={actionMenu}
    >
      {categoryChannels.length > 0 &&
        sortChannels(categoryChannels).map((channel) => (
          <ChannelListItem
            key={channel._id}
            channel={channel}
            isActive={!isLaterPage && channel._id === activeChannelId}
            unread={unreads[channel._id] || 0}
            onClick={() => handleSelectChannel(channel._id)}
            hasDraft={hasDraft(channel._id)}
          />
        ))
      }
    </SidebarSection>
  );
};

export default function CategoryList({
  categories,
  channels,
  expandedGroups,
  onToggleCategory,
  isLaterPage,
  activeChannelId,
  unreads,
  handleSelectChannel,
  hasDraft,
  setCategoryToEdit,
  setChannelToMove,
  handleDeleteCategory,
  activeCategoryMenu,
  setActiveCategoryMenu,
  sortChannels,
}) {
  if (!categories || categories.length === 0) return null;

  return (
    <>
      {categories.map((category) => {
        let categoryChannels = [];
        if (category.type === "department") {
          categoryChannels = channels.filter(c => {
            if (c.isArchived) return false;
            
            const targetDeptId = category.departmentId?.externalId || category.departmentId;
            const isDepartmentChannel = c.flowTaskRef?.entityType === "department" && String(c.flowTaskRef?.entityId) === String(targetDeptId);
            const isProjectInDepartment = c.departmentRef?.departmentId && String(c.departmentRef.departmentId) === String(targetDeptId);
            
            return isDepartmentChannel || isProjectInDepartment;
          });
        } else {
          categoryChannels = channels.filter(c => category.channelIds?.includes(c._id));
        }

        if (category.type === "department" && categoryChannels.length === 0) {
          return null;
        }

        return (
          <CategoryGroup
            key={category._id}
            category={category}
            categoryChannels={categoryChannels}
            expanded={expandedGroups[category._id] !== false}
            onToggle={() => onToggleCategory(category._id)}
            isLaterPage={isLaterPage}
            activeChannelId={activeChannelId}
            unreads={unreads}
            handleSelectChannel={handleSelectChannel}
            hasDraft={hasDraft}
            setCategoryToEdit={setCategoryToEdit}
            setChannelToMove={setChannelToMove}
            handleDeleteCategory={handleDeleteCategory}
            activeCategoryMenu={activeCategoryMenu}
            setActiveCategoryMenu={setActiveCategoryMenu}
            sortChannels={sortChannels}
          />
        );
      })}
    </>
  );
}
