export const SKIN_TONE_MODIFIERS = {
  'Light': '\u{1F3FB}',
  'Medium-Light': '\u{1F3FC}',
  'Medium': '\u{1F3FD}',
  'Medium-Dark': '\u{1F3FE}',
  'Dark': '\u{1F3FF}',
  'Default': '',
};

export const SUPPORTS_SKIN_TONE = /^([\u261D\u270A-\u270D]|\u{1F3CB}|\u{1F3CC}|[\u{1F442}-\u{1F44F}]|[\u{1F466}-\u{1F478}]|\u{1F47C}|[\u{1F481}-\u{1F483}]|[\u{1F48F}-\u{1F491}]|\u{1F4AA}|[\u{1F574}-\u{1F57A}]|[\u{1F590}-\u{1F596}]|[\u{1F645}-\u{1F647}]|[\u{1F64B}-\u{1F64F}]|[\u{1F6B4}-\u{1F6B6}]|\u{1F6C0}|\u{1F6CC}|[\u{1F918}-\u{1F91F}]|\u{1F926}|[\u{1F930}-\u{1F93E}]|[\u{1F9B8}-\u{1F9B9}]|[\u{1F9CD}-\u{1F9CF}]|[\u{1F9D1}-\u{1F9DD}])(\u200D.*)?$/u;

export const applySkinTone = (emoji, tone) => {
  if (!tone) return emoji;
  const modifier = SKIN_TONE_MODIFIERS[tone];
  if (!modifier || !SUPPORTS_SKIN_TONE.test(emoji)) return emoji;
  // If it already has a modifier, don't append
  if (/[\u{1F3FB}-\u{1F3FF}]/u.test(emoji)) return emoji;
  // Remove variation selector-16 (\uFE0F) before appending skin tone
  return emoji.replace(/\uFE0F/g, '') + modifier;
};
