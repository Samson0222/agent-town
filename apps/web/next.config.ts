import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@agent-town/core"],
  reactStrictMode: true,
};

export default config;
