/** @type {import('next').NextConfig} */
/**
 * Web V2 migration is only permitted in its own SSO-protected Vercel Preview.
 * This guard is NOT a production deployment switch, and does not change the
 * original JoyFlix main branch. On the migration branch it also blocks build
 * attempts in the original JoyFlix production-linked Vercel project.
 */
const WEB_V2_PROJECT_ID = 'prj_Rsb44MGU9x6aEd6IqgR4A4MawFrX';
const WEB_V2_MIGRATION_BRANCH = 'feature/web-v2-migration-20261027';
const webV2BuildContext = process.env.VERCEL &&
  (process.env.VERCEL_PROJECT_ID === WEB_V2_PROJECT_ID ||
    process.env.VERCEL_GIT_COMMIT_REF === WEB_V2_MIGRATION_BRANCH);
if (webV2BuildContext) {
  const allowed = process.env.VERCEL_PROJECT_ID === WEB_V2_PROJECT_ID &&
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_TARGET_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === WEB_V2_MIGRATION_BRANCH;
  if (!allowed) {
    throw new Error('WEB_V2_PREVIEW_ONLY_BUILD_BLOCKED: wrong Vercel project, target, or branch');
  }
}

/* eslint-disable @typescript-eslint/no-var-requires */
const nextConfig = {
  output: 'standalone',
  eslint: {
    dirs: ['src'],
  },

  reactStrictMode: false,
  swcMinify: true,

  // Uncoment to add domain whitelist
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },

  webpack(config) {
    // Grab the existing rule that handles SVG imports
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.('.svg')
    );

    config.module.rules.push(
      // Reapply the existing rule, but only for svg imports ending in ?url
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/, // *.svg?url
      },
      // Convert all other *.svg imports to React components
      {
        test: /\.svg$/i,
        issuer: { not: /\.(css|scss|sass)$/ },
        resourceQuery: { not: /url/ }, // exclude if *.svg?url
        loader: '@svgr/webpack',
        options: {
          dimensions: false,
          titleProp: true,
        },
      }
    );

    // Modify the file loader rule to ignore *.svg, since we have it handled now.
    fileLoaderRule.exclude = /\.svg$/i;

    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      crypto: false,
    };

    return config;
  },
};

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  skipWaiting: true,
});

module.exports = withPWA(nextConfig);
