import Link from "next/link";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AuthShell from "../components/auth/AuthShell";
import ResetPasswordForm from "../components/ResetPasswordForm";

export default async function ResetPasswordPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;

	return (
		<AuthShell
			icon={ShieldCheck}
			title="Choose a new password"
			subtitle="Set the password for your account."
		>
			{token ? (
				<ResetPasswordForm token={token} />
			) : (
				<div className="space-y-3">
					<Alert variant="destructive">
						<AlertCircle />
						<AlertDescription>
							This reset link is missing its token. Request a new one.
						</AlertDescription>
					</Alert>
					<Link
						href="/forgot-password"
						className="block text-center text-sm font-medium text-primary hover:underline"
					>
						Request a new link
					</Link>
				</div>
			)}
		</AuthShell>
	);
}
