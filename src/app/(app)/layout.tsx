import { redirect } from "next/navigation";
import AppChrome from "@/app/components/AppChrome";
import { SessionProvider } from "@/app/components/providers/SessionProvider";
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
	// The session is read once here and handed to client screens through the
	// provider, so a component that needs the role does not re-query for it.
	return (
		<SessionProvider user={user}>
			<AppChrome user={user} initialMaster={banks}>
				{children}
			</AppChrome>
		</SessionProvider>
	);
}
