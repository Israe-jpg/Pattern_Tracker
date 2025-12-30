
// Workaround for Node.js < 19.9.0 (os.availableParallelism not available)
const os = require('os');

// Patch os.availableParallelism if it doesn't exist
if (typeof os.availableParallelism !== 'function') {
  Object.defineProperty(os, 'availableParallelism', {
    value: function() {
      return os.cpus().length;
    },
    writable: false,
    enumerable: false,
    configurable: false
  });
}

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;

