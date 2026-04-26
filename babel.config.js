module.exports = function (api) {
  const platform = api.caller((caller) => caller?.platform) ?? 'ios';
  api.cache.using(() => platform);

  // En web, resolver primero *.web.ts para que Metro/Babel usen firebase.web / pedidosCalle.web.
  const extensions =
    platform === 'web'
      ? ['.web.tsx', '.web.ts', '.tsx', '.ts', '.js', '.jsx', '.json']
      : ['.tsx', '.ts', '.js', '.jsx', '.json'];

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Metro web: sin esto, import.meta de dependencias queda en el bundle y el navegador rompe con SyntaxError.
          unstable_transformImportMeta: true,
        },
      ],
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: { '@': './' },
          extensions,
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
