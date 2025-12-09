import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.talkcody.com",
        pathname: "/images/**",
      },
    ],
  },
  // Performance optimizations
  experimental: {
    // Enable optimized package imports for better tree-shaking
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default withMDX(config);
