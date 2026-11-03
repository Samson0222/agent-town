import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@agent-town/core", "@agent-town/office-renderer"],
  reactStrictMode: true,
};

export default config;
