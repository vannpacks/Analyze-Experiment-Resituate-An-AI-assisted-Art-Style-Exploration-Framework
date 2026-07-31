/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable if you need server actions later
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:5000']
    }
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig