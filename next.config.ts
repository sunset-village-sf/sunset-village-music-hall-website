import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    // Flyers uploaded in the admin live in Vercel Blob.
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
  },
  // The admin's Bookings tab became Hall requests; old alert emails link here.
  async redirects() {
    return [{ source: '/admin/bookings', destination: '/admin/requests', permanent: true }]
  },
}

export default nextConfig
