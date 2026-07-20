import Link from "next/link";
import ForgotPasswordForm from "../components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
			<div className="w-full max-w-sm">
				<div className="mb-6 flex flex-col items-center text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-2xl text-white shadow-sm">
						🔑
					</div>
					<h1 className="mt-3 text-lg font-bold text-foreground">Forgot your password?</h1>
					<p className="text-sm text-muted">
						Enter your email and we&apos;ll send a reset link.
					</p>
				</div>
				<div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
					<ForgotPasswordForm />
				</div>
				<p className="mt-4 text-center text-sm text-muted">
					<Link href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
						Back to sign in
					</Link>
				</p>
			</div>
		</main>
	);
}
