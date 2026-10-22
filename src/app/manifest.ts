import type { MetadataRoute } from "next";

/**
 * Lets the app be installed ("Add to Home Screen"). On iPhone this is required
 * for push notifications: Safari only delivers web push to installed apps.
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Audit Toolkit",
		short_name: "Audit Toolkit",
		description: "NIBBS settlement audit and duty register.",
		start_url: "/attendance",
		scope: "/",
		display: "standalone",
		background_color: "#0b1220",
		theme_color: "#4f46e5",
		icons: [
			{ src: "/icons/192", sizes: "192x192", type: "image/png" },
			{ src: "/icons/512", sizes: "512x512", type: "image/png" },
			{ src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
	};
}
