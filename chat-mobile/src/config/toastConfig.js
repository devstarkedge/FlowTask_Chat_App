import React from 'react';
import SuccessToast from '../components/common/SuccessToast';

export const toastConfig = {
  success: (props) => <SuccessToast {...props} />,
  error: (props) => <SuccessToast {...props} />,
  info: (props) => <SuccessToast {...props} />,
  default: (props) => <SuccessToast {...props} />,
};
