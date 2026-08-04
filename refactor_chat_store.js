const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, 'client', 'src', 'stores', 'chatStore.js');
let code = fs.readFileSync(storePath, 'utf8');

// 1. Remove the import of CHAT_FEATURE_FLAGS if it's no longer needed
// Actually, it's used for indexedDbCache and perfDebug, so leave it.

// 2. Remove fields from initial state
code = code.replace(/\s*\/\/ Normalized message entities.*?\n/g, '\n');
code = code.replace(/\s*messagesById:\s*\{\},/g, '');
code = code.replace(/\s*channelMessageIds:\s*\{\},/g, '');
code = code.replace(/\s*messageChannelById:\s*\{\},/g, '');
code = code.replace(/\s*threadRepliesById:\s*\{\},/g, '');
code = code.replace(/\s*threadReplyIdsByRoot:\s*\{\},/g, '');
code = code.replace(/\s*threadRootByReplyId:\s*\{\},/g, '');

// 3. Remove `if (CHAT_FEATURE_FLAGS.normalizedMessageStore) { ... }` blocks
// Since regex can be tricky with nested braces, I'll do a simple loop to find blocks.

function removeBlocks(str, prefix) {
  let result = str;
  while (true) {
    const idx = result.indexOf(prefix);
    if (idx === -1) break;
    
    // Find the opening brace
    let braceIdx = result.indexOf('{', idx);
    if (braceIdx === -1) break; // shouldn't happen
    
    let braceCount = 1;
    let endIdx = braceIdx + 1;
    while (braceCount > 0 && endIdx < result.length) {
      if (result[endIdx] === '{') braceCount++;
      if (result[endIdx] === '}') braceCount--;
      endIdx++;
    }
    
    result = result.substring(0, idx) + result.substring(endIdx);
  }
  return result;
}

code = removeBlocks(code, 'if (CHAT_FEATURE_FLAGS.normalizedMessageStore) {');
code = removeBlocks(code, 'if (CHAT_FEATURE_FLAGS.normalizedMessageStore &&');

// 4. Also replace inline conditionals like:
// const targetChannelId = CHAT_FEATURE_FLAGS.normalizedMessageStore ? state.messageChannelById[messageId] : ...
// We can just use the false branch manually using regex if it's safe.
// Let's use regex for known ternary patterns:
code = code.replace(/CHAT_FEATURE_FLAGS\.normalizedMessageStore\s*\?\s*[^:]+\s*:\s*([^,;\n]+)/g, '$1');

// 5. Remove buildNormalizedChannel and buildThreadReplyIndex functions
code = removeBlocks(code, 'function buildNormalizedChannel');
code = removeBlocks(code, 'function buildThreadReplyIndex');

// 6. Write back
fs.writeFileSync(storePath, code, 'utf8');
console.log('Done refactoring chatStore.js');
