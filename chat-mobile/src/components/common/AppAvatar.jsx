import React from 'react';
import BaseAvatar from '../Avatar';

/**
 * AppAvatar
 * Thin wrapper around the legacy `Avatar` component to provide a
 * centralized import path going forward (src/components/common).
 */
const AppAvatar = (props) => {
  return <BaseAvatar {...props} />;
};

export default AppAvatar;
