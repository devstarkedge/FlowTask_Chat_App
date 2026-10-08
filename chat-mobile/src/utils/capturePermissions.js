import { Alert, Linking, Platform } from 'react-native';

export function showCapturePermissionDenied(capability, canAskAgain = true) {
  const message = `${capability} access is required to record ${capability === 'Microphone' ? 'audio clips or video with sound' : 'photos and video clips'}.${canAskAgain ? '' : ` Enable ${capability} access for TaskChat in Settings.`}`;
  const buttons = [{ text: 'Cancel', style: 'cancel' }];
  if (!canAskAgain && Platform.OS !== 'web') buttons.push({ text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => Alert.alert('Permission Required', 'Open system Settings to enable access for TaskChat.')) });
  Alert.alert('Permission Required', message, buttons);
}

// Call from the user's capture action, never from a mount effect.
export async function ensureCapturePermission(getPermission, requestPermission, capability) {
  try {
    let permission = await getPermission();
    if (permission.granted || permission.status === 'granted') return true;
    if (permission.canAskAgain !== false) permission = await requestPermission();
    if (permission.granted || permission.status === 'granted') return true;
    showCapturePermissionDenied(capability, permission.canAskAgain !== false);
  } catch {
    Alert.alert('Capture Unavailable', `Unable to check ${capability.toLowerCase()} access. Please try again.`);
  }
  return false;
}
