import { brandMarkImage } from "@/lib/brand/markImage";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Browser-tab icon: the same gradient mark used in the app shell's logo. */
export default function Icon() {
	return brandMarkImage(32);
}
