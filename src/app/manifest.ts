import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BrandOS",
    short_name: "BrandOS",
    description: "Every client, brand, offer and asset your agency works on, in one building.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#F8FAFC",
    theme_color: "#2D4A5C",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Your queue", short_name: "Queue", url: "/?inbox=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Global Library", short_name: "Library", url: "/library", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Team", url: "/team", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
