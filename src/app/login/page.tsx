import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getSessionUser } from "@/services/auth/sessions";
import AuthShell from "../components/auth/AuthShell";
import LoginForm from "../components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
	const user = await getSessionUser();
	if (user) redirect(user.mustChangePassword ? "/change-password" : "/");

	return (
		<AuthShell icon={Landmark} title="Audit Toolkit" subtitle="Sign in to continue">
			<LoginForm />
		</AuthShell>
	);
}
