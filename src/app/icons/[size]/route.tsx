import { brandMarkImage } from "@/lib/brand/markImage";

const SIZES = new Set([192, 512]);

/** `/icons/192` and `/icons/512`: install-manifest and notification icons. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
	const px = Number((await params).size);
	if (!SIZES.has(px)) return new Response("Not found", { status: 404 });
	const image = brandMarkImage(px);
	image.headers.set("Cache-Control", "public, max-age=86400, immutable");
	return image;
}
