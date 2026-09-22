import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: { root: process.cwd() },
  devIndicators: false,
};

export default nextConfig;
