const fs = require('fs');
const path = require('path');

const targetFiles = [
  'src/screens/Chat/ChatScreen.jsx',
  'src/screens/ThreadDetailScreen.jsx',
  'src/components/MessageComposer.jsx',
  'src/screens/Home/HomeScreen.jsx',
];

function applyResponsive(filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf8');

  // Add import if not present
  if (!content.includes('from "../../utils/responsive"') && !content.includes("from '../utils/responsive'")) {
    const depth = filePath.split('/').length - 2;
    const prefix = '../'.repeat(depth) || './';
    const importStmt = `import { scale, verticalScale, moderateScale } from '${prefix}utils/responsive';\n`;
    content = content.replace(/(import React.*?;)/, `$1\n${importStmt}`);
  }

  // A simple regex to replace fontSize: 15 with fontSize: moderateScale(15) inside StyleSheet.create
  // We'll target specific properties only inside StyleSheet
  let isStyleSheet = false;
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('StyleSheet.create({')) {
      isStyleSheet = true;
    }
    
    if (isStyleSheet) {
      // Font sizes
      lines[i] = lines[i].replace(/fontSize:\s*(\d+)/g, 'fontSize: moderateScale($1)');
      // Paddings/Margins horizontal
      lines[i] = lines[i].replace(/(padding|margin)(Horizontal|Left|Right|Start|End):\s*(\d+)/g, '$1$2: scale($3)');
      // Paddings/Margins vertical
      lines[i] = lines[i].replace(/(padding|margin)(Vertical|Top|Bottom):\s*(\d+)/g, '$1$2: verticalScale($3)');
      // Widths/Heights (only numeric)
      lines[i] = lines[i].replace(/\b(width|height|minWidth|maxWidth):\s*(\d+)\b/g, '$1: scale($2)');
      lines[i] = lines[i].replace(/\b(minHeight|maxHeight):\s*(\d+)\b/g, '$1: verticalScale($2)');
      // Border radius
      lines[i] = lines[i].replace(/borderRadius:\s*(\d+)/g, 'borderRadius: moderateScale($1)');
    }
  }

  fs.writeFileSync(fullPath, lines.join('\n'), 'utf8');
  console.log('Applied responsive to:', filePath);
}

targetFiles.forEach(applyResponsive);
