/** Missing legacy preference fields use the enabled schema default. */
export function shouldSendMobilePush({ mobilePushEnabled }) {
  return mobilePushEnabled !== false;
}
