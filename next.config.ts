import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Giữ local/CI build trong một worker để tránh nhiều process Next.js dồn RAM.
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
