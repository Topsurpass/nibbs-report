import { redirect } from "next/navigation";
import UserManagement from "@/app/components/UserManagement";
import { getSessionUser } from "@/services/auth/sessions";

export const dynamic = "force-dynamic";

// User Management ("/users") — admins only. Analysts are bounced to the audit.
export default async function UsersPage() {
	const user = await getSessionUser();
	if (!user) redirect("/login");
	if (user.role !== "admin") redirect("/");

	return <UserManagement currentUserId={user.id} />;
}
