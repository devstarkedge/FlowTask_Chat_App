import { useMemo, useState } from 'react';

/**
 * Search hook for New Message screen
 * Searches channels, DMs, and users
 */
export const useNewMessageSearch = (channels, query = '') => {
  const normalizedQuery = query.toLowerCase().trim();

  return useMemo(() => {
    if (!normalizedQuery) {
      // No search - return categorized defaults
      const dmChannels = channels.filter(c => c.type === 'dm');
      const regularChannels = channels.filter(c => c.type !== 'dm');
      
      // Recent: DMs with lastMessageAt, sorted desc, top 5
      const recent = [...dmChannels]
        .filter(c => c.lastMessageAt)
        .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
        .slice(0, 5);

      return {
        recent,
        channels: regularChannels,
        dms: dmChannels,
        filtered: false,
      };
    }

    // Search mode - filter all
    const allChannels = channels.filter(c => {
      const name = (c.name || '').toLowerCase();
      return name.includes(normalizedQuery);
    });

    const dmResults = allChannels.filter(c => c.type === 'dm');
    const channelResults = allChannels.filter(c => c.type !== 'dm');

    return {
      recent: [],
      channels: channelResults,
      dms: dmResults,
      filtered: true,
    };
  }, [channels, normalizedQuery]);
};
