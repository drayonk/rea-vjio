// Extends app.json. The web demo build (EXPO_PUBLIC_DEMO=1) ships as a single
// bundle: lazily loaded route chunks resolve against the site root, which
// breaks when the demo is hosted under a sub-path.
module.exports = ({ config }) =>
  process.env.EXPO_PUBLIC_DEMO === "1"
    ? {
        ...config,
        plugins: config.plugins.map((p) => (p === "expo-router" ? ["expo-router", { asyncRoutes: false }] : p)),
      }
    : config;
