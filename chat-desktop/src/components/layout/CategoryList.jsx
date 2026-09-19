import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ListPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import SidebarSection from "./sidebar/SidebarSection";
import SidebarItem from "./sidebar/SidebarItem";
import ChannelListItem from "./sidebar/ChannelListItem";
import { getDepartmentChannels, isPersonalCategoryChannel } from "../../utils/channelOrigin";
import { categoryAssignmentId, getCustomCategoryOwners } from "../../utils/categoryAssignments";


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
  const isChatCategory = category.type === "custom";
  const isMenuOpen = isChatCategory && activeCategoryMenu === category._id;
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const closeMenu = (event) => {
      if (
        !btnRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setActiveCategoryMenu(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActiveCategoryMenu(null);
        btnRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setActiveCategoryMenu(null);

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [isMenuOpen, setActiveCategoryMenu]);

  const handleOpenMenu = (e) => {
    e.stopPropagation();
    if (!isMenuOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 132;
      const hasRoomBelow = window.innerHeight - rect.bottom >= menuHeight + 8;
      setMenuPos({
        top: hasRoomBelow ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6),
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    setActiveCategoryMenu(isMenuOpen ? null : category._id);
  };

  const actionMenu = isChatCategory ? (
    <div className={`category-actions${isMenuOpen ? " is-open" : ""}`}>
      <button
        ref={btnRef}
        onClick={handleOpenMenu}
        className="category-actions__trigger"
        title="Category actions"
        aria-label={`Actions for ${category.name}`}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {isMenuOpen && createPortal(
        <div
          ref={menuRef}
          className="category-actions__menu"
          role="menu"
          aria-label={`${category.name} actions`}
          style={{ top: menuPos.top, right: menuPos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="category-actions__item"
            role="menuitem"
            onClick={() => { setCategoryToEdit(category); setActiveCategoryMenu(null); }}
          >
            <Pencil size={15} aria-hidden="true" />
            <span>Edit category</span>
          </button>
          <button
            className="category-actions__item"
            role="menuitem"
            onClick={() => { setChannelToMove({ categoryId: category._id }); setActiveCategoryMenu(null); }}
          >
            <ListPlus size={15} aria-hidden="true" />
            <span>Add channels</span>
          </button>
          <div className="category-actions__separator" role="separator" />
          <button
            className="category-actions__item category-actions__item--danger"
            role="menuitem"
            onClick={() => { handleDeleteCategory(category._id); setActiveCategoryMenu(null); }}
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Delete category</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  ) : null;

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
  const customCategoryOwners = getCustomCategoryOwners(categories);

  return (
    <>
      {categories.map((category) => {
        // A deleted FlowTask department populates as null.
        if (category.type === "department" && !category.departmentId) return null;
        let categoryChannels = [];
        if (category.type === "department") {
          categoryChannels = getDepartmentChannels(channels, category.departmentId)
            .filter((channel) => !customCategoryOwners.has(categoryAssignmentId(channel._id)));
          if (categoryChannels.length === 0) return null;
        } else {
          const categoryId = categoryAssignmentId(category._id);
          categoryChannels = channels.filter((channel) => (
            isPersonalCategoryChannel(channel)
            && customCategoryOwners.get(categoryAssignmentId(channel._id)) === categoryId
          ));
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
