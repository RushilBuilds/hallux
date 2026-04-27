import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Output standalone for Docker/Vercel deployments.
  output: 'standalone',
};

export default nextConfig;
