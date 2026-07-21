import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@prompt-inspector/core"],
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config) => {
    // @prompt-inspector/core ships TS source with ESM-style ".js" import
    // specifiers (e.g. "./tokens.js" → ./tokens.ts). Teach webpack to
    // resolve them against the .ts files.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
