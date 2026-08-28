import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Giữ local/CI build trong một worker để tránh nhiều process Next.js dồn RAM.
  experimental: {
    cpus: 1,
    // Giảm peak memory của Webpack; đổi lại thời gian compile có thể tăng nhẹ.
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
