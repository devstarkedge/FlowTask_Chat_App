const m = require('../src/screens/Canvas/EditorHtml.js');
const html = m.EDITOR_HTML;
console.log('HTML length:', html.length);
console.log('Has editor div:', html.includes('id="editor"'));
console.log('Has TipTapBundle:', html.includes('TipTapBundle'));
console.log('Has esm.sh (should be false):', html.includes('esm.sh'));
console.log('Has type=module (should be false):', html.includes('type="module"'));
console.log('Has StarterKit:', html.includes('StarterKit'));
console.log('First 300 chars of HTML:', html.slice(0, 300));
