"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AuthUser } from "@/types/user";

/**
 * The signed-in user, for client components below the (app) layout.
 *
 * The layout already reads the session server-side to render the shell, so this
 * hands the same object down rather than making every screen that needs a role
 * re-read it. Client components depend on this context, not on a server call.
 *
 * The server stays authoritative: this decides what to *render*, never what is
 * allowed. Every route handler re-checks the session itself.
 */

const SessionContext = createContext<AuthUser | null>(null);

export function SessionProvider({
	user,
	children,
}: {
	user: AuthUser;
	children: ReactNode;
}) {
	return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useAuthUser(): AuthUser {
	const user = useContext(SessionContext);
	if (!user) throw new Error("useAuthUser must be used within SessionProvider");
	return user;
}
