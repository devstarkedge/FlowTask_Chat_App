module.exports = function(api) {
  api.cache(true);
  const env = process.env.BABEL_ENV || process.env.NODE_ENV;
  const plugins = ['react-native-reanimated/plugin'];
  
  if (env === 'production') {
    plugins.push('transform-remove-console');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
