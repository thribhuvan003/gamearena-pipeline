// next.config.ts: Next.js settings for the dashboard.

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  agentRules: false,
};

export default nextConfig;
