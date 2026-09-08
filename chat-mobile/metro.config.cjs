const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

// Get the default config from expo and then ensure projectRoot/watchFolders
const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [path.resolve(projectRoot)];

// Ensure .jsx is recognized
config.resolver = {
  ...config.resolver,
  sourceExts: Array.from(new Set([...(config.resolver && config.resolver.sourceExts ? config.resolver.sourceExts : []), 'jsx', 'cjs'])),
  assetExts: [...(config.resolver?.assetExts || []), 'txt'],
};

if (config.watcher && 'unstable_workerThreads' in config.watcher) {
  delete config.watcher.unstable_workerThreads;
}
if (config.transformer && 'unstable_workerThreads' in config.transformer) {
  delete config.transformer.unstable_workerThreads;
}
module.exports = config;
