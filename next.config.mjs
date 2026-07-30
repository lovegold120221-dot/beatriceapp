/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_GEMINI_API_KEY: process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
    HF_TOKEN: process.env.HF_TOKEN,
    NEXT_PUBLIC_HF_TOKEN: process.env.NEXT_PUBLIC_HF_TOKEN || process.env.HF_TOKEN,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    NEXT_PUBLIC_OLLAMA_BASE_URL: process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    NEXT_PUBLIC_OLLAMA_MODEL: process.env.NEXT_PUBLIC_OLLAMA_MODEL || process.env.OLLAMA_MODEL,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'eburon.ai',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};
export default nextConfig;
