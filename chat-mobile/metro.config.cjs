const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;

// Get the default config from expo and then ensure projectRoot/watchFolders
const config = getDefaultConfig(projectRoot);

config.projectRoot = projectRoot;
config.watchFolders = [path.resolve(projectRoot)];

// Windows creates directory watchers for the file map. Native build trees and
// exported bundles are not app sources; match their absolute paths as Metro does.
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rootPattern = projectRoot.split(/[\\/]/).map(escape).join('[\\\\/]');
const generatedFolders = new RegExp(`^${rootPattern}[\\\\/](?:dist(?:_[^\\\\/]+)?|coverage|\\.verification-[^\\\\/]+|android[\\\\/](?:\\.gradle|build|app[\\\\/]build)|ios[\\\\/](?:Pods|build))(?:[\\\\/]|$)`);
const existingBlockList = config.resolver.blockList || [];
config.resolver.blockList = [...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]), generatedFolders];
if (process.platform === 'win32') config.maxWorkers = 2;

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
