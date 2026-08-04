const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, 'client', 'src', 'stores', 'chatStore.js');
let code = fs.readFileSync(storePath, 'utf8');

// Line 608
code = code.replace(/if \(\s*CHAT_FEATURE_FLAGS\.normalizedMessageStore &&\s*state\.messagesById\[tempId\]\s*\) \{[\s\S]*?return \{[\s\S]*?messagesByChannel: \{[\s\S]*?\[resolvedChannelId\]: nextChannelMessages,[\s\S]*?\},[\s\S]*?messagesById: \{[\s\S]*?\},[\s\S]*?messageChannelById: \{[\s\S]*?\},[\s\S]*?\};[\s\S]*?\}/g, '');

// Line 1099
code = code.replace(/if \(\s*CHAT_FEATURE_FLAGS\.normalizedMessageStore &&\s*state\.messagesById\[rootMessageId\]\s*\) \{[\s\S]*?return \{[\s\S]*?messagesByChannel: \{[\s\S]*?\[resolvedChannelId\]: nextChannelMessages,[\s\S]*?\},[\s\S]*?messagesById: \{[\s\S]*?\},[\s\S]*?\};[\s\S]*?\}/g, '');

// Line 1147
code = code.replace(/const nextById = CHAT_FEATURE_FLAGS\.normalizedMessageStore && state\.messagesById\[rootMessageId\]\s*\?\s*\{ \.\.\.state\.messagesById, \[rootMessageId\]: \{ \.\.\.state\.messagesById\[rootMessageId\], \.\.\.updates \} \}\s*:\s*state\.messagesById;/g, '');
code = code.replace(/messagesById: nextById,/g, '');

// Line 1433 and 1487
code = code.replace(/if \(\s*CHAT_FEATURE_FLAGS\.normalizedMessageStore &&\s*state\.messagesById\[messageId\]\s*\) \{[\s\S]*?return \{[\s\S]*?messagesByChannel: \{[\s\S]*?\[channelId\]: nextChannelMessages,[\s\S]*?\},[\s\S]*?messagesById: \{[\s\S]*?\},[\s\S]*?\};[\s\S]*?\}/g, '');

// Line 1571
code = code.replace(/if \(\s*CHAT_FEATURE_FLAGS\.normalizedMessageStore &&\s*messageId &&\s*state\.messagesById\[messageId\]\s*\) \{[\s\S]*?return \{[\s\S]*?pinnedMessagesByChannel: nextPinned,[\s\S]*?messagesById: \{[\s\S]*?\},[\s\S]*?\};[\s\S]*?\}/g, '');

// Line 1657 subscriber
code = code.replace(/useChatStore\.subscribe\(\(state, prevState\) => \{[\s\S]*?\}\);/g, '');

// Write back
fs.writeFileSync(storePath, code, 'utf8');
console.log('Done refactoring remaining lines.');
