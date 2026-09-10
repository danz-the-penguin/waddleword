/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/scpro',
        destination: '/',
        permanent: true,
      },
      {
        source: '/waddleword',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
