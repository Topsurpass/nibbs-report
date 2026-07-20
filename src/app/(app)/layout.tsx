import { redirect } from "next/navigation";
import AppChrome from "@/app/components/AppChrome";
import { getSessionUser } from "@/services/auth/sessions";
import { listBanks } from "@/services/banks/repository";

// Reads the session cookie + DB; renders per-request. Stays mounted across
// soft navigations between /, /settings, /users, so the shell + providers (and
// any in-progress audit) persist.
export const dynamic = "force-dynamic";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getSessionUser();
	if (!user) redirect("/login");
	if (user.mustChangePassword) redirect("/change-password");

	const banks = await listBanks();
	return (
		<AppChrome user={user} initialMaster={banks}>
			{children}
		</AppChrome>
	);
}
