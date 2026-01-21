/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    API_URL: process.env.API_URL || 'http://localhost:8000/api/v1',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  },
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${process.env.API_URL || 'http://localhost:8000/api/v1'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
