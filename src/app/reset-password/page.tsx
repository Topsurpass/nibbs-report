import Link from "next/link";
import ResetPasswordForm from "../components/ResetPasswordForm";

export default async function ResetPasswordPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;

	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
			<div className="w-full max-w-sm">
				<div className="mb-6 flex flex-col items-center text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-2xl text-white shadow-sm">
						🔐
					</div>
					<h1 className="mt-3 text-lg font-bold text-foreground">Choose a new password</h1>
					<p className="text-sm text-muted">Set the password for your account.</p>
				</div>
				<div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
					{token ? (
						<ResetPasswordForm token={token} />
					) : (
						<div className="space-y-3 text-sm">
							<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
								This reset link is missing its token. Request a new one.
							</div>
							<Link
								href="/forgot-password"
								className="block text-center font-medium text-indigo-600 hover:underline dark:text-indigo-400"
							>
								Request a new link
							</Link>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
