/** Mobile push delivery follows the user's mobile preference, independent of presence. */
export function shouldSendMobilePush({ mobilePushEnabled }) {
  return Boolean(mobilePushEnabled);
}
