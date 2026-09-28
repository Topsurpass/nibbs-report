import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/services/auth/sessions";
import AuthShell from "../components/auth/AuthShell";
import ChangePasswordForm from "../components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	const forced = user.mustChangePassword;

	return (
		<AuthShell
			icon={ShieldCheck}
			title={forced ? "Set your password" : "Change password"}
			subtitle={
				forced
					? "Choose a new password to finish setting up your account."
					: "Update the password for your account."
			}
		>
			<ChangePasswordForm forced={forced} />
		</AuthShell>
	);
}
