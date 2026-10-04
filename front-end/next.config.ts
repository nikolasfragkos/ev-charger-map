const backendProxyTarget = (process.env.BACKEND_API_URL ?? 'http://localhost:9876').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.1.8:3000', // phone accessing your PC
  ],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendProxyTarget}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
