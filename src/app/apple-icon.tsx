import { brandMarkImage } from "@/lib/brand/markImage";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iPhone home-screen icon (iOS rounds the corners itself). */
export default function AppleIcon() {
	return brandMarkImage(180, { rounded: false });
}
