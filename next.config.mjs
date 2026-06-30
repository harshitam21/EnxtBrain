/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    // Disable file-system cache for both dev and prod to avoid OOM crashes
    config.cache = false;
    // Disable JS minification for production builds (larger bundles but safe)
    if (!dev && config.optimization) {
      config.optimization.minimize = false;
    }
    return config;
  },
};

export default nextConfig;
