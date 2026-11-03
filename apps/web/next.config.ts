import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@agent-town/core", "@agent-town/pixel-office"],
  reactStrictMode: true,
};

export default config;
