import { redirect } from "next/navigation";
import { getSessionUser } from "@/services/auth/sessions";
import LoginForm from "../components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
	const user = await getSessionUser();
	if (user) redirect(user.mustChangePassword ? "/change-password" : "/");

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
			<div className="w-full max-w-sm">
				<div className="mb-6 flex flex-col items-center text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-2xl text-white shadow-sm">
						🏦
					</div>
					<h1 className="mt-3 text-lg font-bold text-foreground">
						Audit Toolkit
					</h1>
					<p className="text-sm text-muted">Sign in to continue</p>
				</div>
				<div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
					<LoginForm />
				</div>
			</div>
		</main>
	);
}
