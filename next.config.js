/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Vercel builds were stalling during the combined lint/type-check step.
    // This keeps TypeScript checking enabled but skips ESLint during `next build`.
    ignoreDuringBuilds: true,
  },
};
module.exports = nextConfig;
