import uuid from 'react-native-uuid'; // Or simple timestamp uuid generator if react-native-uuid is not installed.
// Let's generate a simple lightweight UUID to avoid installing packages.
export const generateClientMessageId = () => {
  return 'cmsg_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
};
