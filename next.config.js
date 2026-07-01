/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep native/Node-only packages out of the client bundle. pdf-parse + mammoth
    // read the filesystem; the Pinecone client must stay server-side so
    // describeIndexStats() returns fresh namespace data.
    serverComponentsExternalPackages: [
      "pdf-parse",
      "mammoth",
      "@pinecone-database/pinecone",
      "firebase-admin",
    ],
  },
};

module.exports = nextConfig;
