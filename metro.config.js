const { getDefaultConfig } = require('@expo/metro-config');
const path = require('path');

const backendVenv = path.resolve(__dirname, 'backend', 'venv').replace(/\\/g, '/');
const backendVenvPattern = new RegExp(`${backendVenv}.*`);

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);
  config.resolver = {
    ...config.resolver,
    blockList: [...(config.resolver.blockList || []), backendVenvPattern],
  };
  return config;
})();
