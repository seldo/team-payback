/** @type {import('next').NextConfig} */
// Next.js 15 auto-loads `instrumentation.ts` (the `instrumentationHook` is on by default).
// On Next 14, add: experimental: { instrumentationHook: true }
const nextConfig = {
  allowedDevOrigins: ['10.20.110.107'],
};

export default nextConfig;
