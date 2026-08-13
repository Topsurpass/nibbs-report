import { redirect } from "next/navigation";
import EscalationSplitter from "@/app/components/escalation/EscalationSplitter";
import { getSessionUser } from "@/services/auth/sessions";
import { listNipOverrides } from "@/services/escalation/nip-overrides-repository";
import type { NipOverride } from "@/lib/escalation/nipDirectory";

export const dynamic = "force-dynamic";

export default async function EscalationsPage() {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	// Overrides only — the 250 bundled codes ship in the client bundle already.
	// A DB hiccup must not block a splitter that works fine without them.
	let overrides: NipOverride[] = [];
	try {
		overrides = await listNipOverrides();
	} catch (err) {
		console.error("[escalations] could not load saved bank codes", err);
	}

	return <EscalationSplitter initialOverrides={overrides} />;
}
