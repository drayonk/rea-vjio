// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Web demo build (EXPO_PUBLIC_DEMO=1): swap the store, secure storage and
// network for in-browser fakes. Normal builds are unaffected.
if (process.env.EXPO_PUBLIC_DEMO === "1") {
  const demo = (file) => path.join(__dirname, "demo", file);
  const replacements = new Map([
    [path.join(__dirname, "src", "billing.ts"), demo("billing.ts")],
  ]);
  config.watchFolders = [...config.watchFolders, path.join(__dirname, "..", "backend", "src")];
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "expo-secure-store") return { type: "sourceFile", filePath: demo("secure-store.ts") };
    const resolved = (upstream ?? context.resolveRequest)(context, moduleName, platform);
    const replacement = resolved.type === "sourceFile" && !context.originModulePath.startsWith(demo(""))
      ? replacements.get(resolved.filePath)
      : undefined;
    return replacement ? { type: "sourceFile", filePath: replacement } : resolved;
  };
}

module.exports = config;
