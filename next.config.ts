import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Let phones on the same Wi-Fi load the dev server via this computer's LAN IP.
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanIps, "*.local"],
};

export default nextConfig;
