import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pinuj workspace root na ovaj projekat. Bez ovoga Next bira pogrešan root
  // (home folder, zbog zalutalog package-lock.json u C:\Users\Korisnik) i
  // Turbopack pokušava da watch-uje ceo home → dev server visi na compile-u.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
