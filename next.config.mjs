/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a Node builtin, keep it server-side only
  serverExternalPackages: [],
  // 自包含产物：挪出 .next 运行，规避 safe-delete shim 删构建产物导致的反复崩
  output: "standalone",
};
export default nextConfig;
