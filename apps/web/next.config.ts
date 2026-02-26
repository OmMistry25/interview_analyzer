import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@transcript-evaluator/core",
  ],
};

export default nextConfig;
