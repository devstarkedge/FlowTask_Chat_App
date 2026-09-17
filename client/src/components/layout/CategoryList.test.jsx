import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CategoryList from './CategoryList';

afterEach(cleanup);

const department = {
  _id: 'category-1', name: 'Engineering', type: 'department',
  departmentId: { _id: 'local-dept', externalId: 'flowtask-dept', name: 'Engineering' },
};
const generatedChannel = {
  _id: 'generated', name: 'Engineering', type: 'department',
  flowTaskRef: { entityType: 'department', entityId: 'flowtask-dept' },
};
const projectChannel = {
  _id: 'project', name: 'Release plan', type: 'project', visibility: 'private',
  flowTaskRef: { entityType: 'board', entityId: 'board-1' },
  departmentRef: { departmentId: 'flowtask-dept', departmentName: 'Engineering' },
};

function props(channels, categories = [department]) {
  return {
    channels, categories, expandedGroups: {}, unreads: {},
    onToggleCategory: vi.fn(), handleSelectChannel: vi.fn(), hasDraft: () => false,
    setCategoryToEdit: vi.fn(), setChannelToMove: vi.fn(), handleDeleteCategory: vi.fn(),
    setActiveCategoryMenu: vi.fn(), sortChannels: (items) => items,
  };
}

describe('department channel sections', () => {
  it('shows no section for a department without real channels', () => {
    const { container, rerender } = render(<CategoryList {...props([])} />);
    expect(container.querySelector('.sidebar-section')).toBeNull();
    rerender(<CategoryList {...props([generatedChannel])} />);
    expect(container.querySelector('.sidebar-section')).toBeNull();
  });

  it('adds a later project under the department with separate names and correct count', () => {
    const { container, rerender } = render(<CategoryList {...props([generatedChannel])} />);
    rerender(<CategoryList {...props([generatedChannel, projectChannel])} />);
    expect(screen.getByText(/Engineering/).closest('.sidebar-section-header')).not.toBeNull();
    expect(screen.getByText('Release plan').closest('.sidebar-section-list')).not.toBeNull();
    expect(container.querySelector('.sidebar-section-count').textContent).toBe('1');
    expect(screen.queryByText('Engineering Release plan')).toBeNull();
    expect(container.querySelectorAll('.sidebar-item')).toHaveLength(1);
  });

  it('includes an actual assigned ChatApp channel', () => {
    const channel = { _id: 'manual', name: 'Team chat', type: 'public', departmentRef: { departmentId: 'flowtask-dept' } };
    render(<CategoryList {...props([generatedChannel, channel])} />);
    expect(screen.getByText('Team chat').closest('.sidebar-section-list')).not.toBeNull();
  });

  it('hides the department when its last channel is archived or reassigned', () => {
    const { container, rerender } = render(<CategoryList {...props([{ ...projectChannel, isArchived: true }])} />);
    expect(container.querySelector('.sidebar-section')).toBeNull();
    rerender(<CategoryList {...props([{ ...projectChannel, departmentRef: { departmentId: 'other-dept' } }])} />);
    expect(container.querySelector('.sidebar-section')).toBeNull();
  });

  it('excludes generated department channels from custom categories too', () => {
    render(<CategoryList {...props([generatedChannel, projectChannel], [{
      _id: 'custom', name: 'Favorites', type: 'custom', channelIds: ['generated', 'project'],
    }])} />);
    expect(screen.queryByText('Engineering')).toBeNull();
    expect(screen.getByText('Release plan')).not.toBeNull();
  });
});
