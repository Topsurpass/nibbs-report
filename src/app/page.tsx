import { redirect } from "next/navigation";
import AppShell from "./components/AppShell";
import { getSessionUser } from "@/services/auth/sessions";
import { listBanks } from "@/services/banks/repository";

// Reads the session cookie + DB, so it must render per-request.
export const dynamic = "force-dynamic";

export default async function Home() {
	const user = await getSessionUser();
	if (!user) redirect("/login");
	if (user.mustChangePassword) redirect("/change-password");

	const banks = await listBanks();
	return <AppShell user={user} initialMaster={banks} />;
}
