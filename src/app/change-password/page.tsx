import { redirect } from "next/navigation";
import { getSessionUser } from "@/services/auth/sessions";
import ChangePasswordForm from "../components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
	const user = await getSessionUser();
	if (!user) redirect("/login");

	const forced = user.mustChangePassword;

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
			<div className="w-full max-w-sm">
				<div className="mb-6 flex flex-col items-center text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-2xl text-white shadow-sm">
						🔐
					</div>
					<h1 className="mt-3 text-lg font-bold text-foreground">
						{forced ? "Set your password" : "Change password"}
					</h1>
					<p className="text-sm text-muted">
						{forced
							? "Choose a new password to finish setting up your account."
							: "Update the password for your account."}
					</p>
				</div>
				<div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
					<ChangePasswordForm forced={forced} />
				</div>
			</div>
		</main>
	);
}
