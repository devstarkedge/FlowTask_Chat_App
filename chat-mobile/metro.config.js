const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

// Get the default config from expo and then ensure projectRoot/watchFolders
const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [path.resolve(projectRoot)];

// Ensure .jsx is recognized
config.resolver = {
  ...config.resolver,
  sourceExts: Array.from(new Set([...(config.resolver && config.resolver.sourceExts ? config.resolver.sourceExts : []), 'jsx', 'cjs']))
};

module.exports = config;
