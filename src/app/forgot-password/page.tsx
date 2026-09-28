import Link from "next/link";
import { KeyRound } from "lucide-react";
import AuthShell from "../components/auth/AuthShell";
import ForgotPasswordForm from "../components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
	return (
		<AuthShell
			icon={KeyRound}
			title="Forgot your password?"
			subtitle="Enter your email and we'll send a reset link."
			footer={
				<Link href="/login" className="font-medium text-primary hover:underline">
					Back to sign in
				</Link>
			}
		>
			<ForgotPasswordForm />
		</AuthShell>
	);
}
