#!/usr/bin/env node

/**
 * Quick verification that all imports and dependencies are working
 */

console.log('🔍 Verifying FlowTask Chat Mobile setup...\n');

try {
  // Test theme imports
  const { getTheme, accentColors, sidebarPresets } = require('./src/theme/colors.js');
  console.log('✅ Theme colors loaded');
  console.log('   - Accent colors:', Object.keys(accentColors).join(', '));
  console.log('   - Sidebar presets:', Object.keys(sidebarPresets).join(', '));
  
  // Test theme generation
  const testTheme = getTheme('light', 'aubergine', 'blue', {});
  console.log('✅ Theme generation works');
  console.log('   - Primary color:', testTheme.primary);
  console.log('   - Background:', testTheme.background);
  console.log('   - Header gradient:', testTheme.headerGradient);
  
  console.log('\n✅ All verifications passed!');
  console.log('\n📱 You can now run:');
  console.log('   npm start (or npx expo start)');
  
} catch (error) {
  console.error('❌ Verification failed:', error.message);
  console.error('\nStack:', error.stack);
  process.exit(1);
}
