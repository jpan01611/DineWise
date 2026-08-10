const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const backendDotVenv = path.resolve(__dirname, 'backend', '.venv').replace(/\\/g, '/');
const backendVenv = path.resolve(__dirname, 'backend', 'venv').replace(/\\/g, '/');
const backendDotVenvPattern = new RegExp(`^${escapeRegex(backendDotVenv)}(?:/.*)?$`);
const backendVenvPattern = new RegExp(`^${escapeRegex(backendVenv)}(?:/.*)?$`);

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);
  const existingBlockList = config.resolver.blockList;

  const blockList = [backendDotVenvPattern, backendVenvPattern];
  if (Array.isArray(existingBlockList)) {
    blockList.push(...existingBlockList);
  } else if (existingBlockList) {
    blockList.push(existingBlockList);
  }

  config.resolver = {
    ...config.resolver,
    blockList,
  };
  return config;
})();
