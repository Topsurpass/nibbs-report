import { ImageResponse } from "next/og";

/**
 * The app mark (gradient tile + landmark glyph) as a PNG of any size: the
 * browser-tab icon, the home-screen icon and the notification icon all come
 * from here, so there is no binary asset to keep in sync.
 */
export function brandMarkImage(px: number, opts: { rounded?: boolean } = {}): ImageResponse {
	const rounded = opts.rounded ?? true;
	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					borderRadius: rounded ? Math.round(px * 0.22) : 0,
					background: "linear-gradient(135deg, #0d9488 0%, #4f46e5 55%, #7c3aed 100%)",
				}}
			>
				<svg width={Math.round(px * 0.62)} height={Math.round(px * 0.62)} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
					<path d="M10 18v-7" />
					<path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z" />
					<path d="M14 18v-7" />
					<path d="M18 18v-7" />
					<path d="M3 22h18" />
					<path d="M6 18v-7" />
				</svg>
			</div>
		),
		{ width: px, height: px },
	);
}
