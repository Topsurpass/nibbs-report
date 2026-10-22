"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePush } from "../providers/PushProvider";
import { PUSH_HELP, PUSH_PITCH } from "./pushCopy";

/** Header bell: like a channel's subscribe bell, on or off for this device. */
export default function NotificationBell() {
	const { state, missing, busy, error, enable, disable, sendTest } = usePush();
	const [testing, setTesting] = useState(false);
	const on = state === "on";
	const Icon = on ? BellRing : state === "blocked" ? BellOff : Bell;

	const test = async () => {
		setTesting(true);
		try {
			toast.success(await sendTest());
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't send a test.");
		} finally {
			setTesting(false);
		}
	};

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="outline"
						size="icon"
						className={cn("relative size-8", on && "border-primary/40 text-primary")}
						aria-label={on ? "Notifications on" : "Turn on notifications"}
					/>
				}
			>
				<Icon className="size-4" />
				{state === "off" && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-background" />}
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 gap-3 p-4">
				<PopoverHeader>
					<PopoverTitle className="flex items-center gap-2 text-sm font-semibold">
						<Icon className={cn("size-4", on ? "text-primary" : "text-muted-foreground")} />
						{on ? "Notifications are on" : "Notifications"}
					</PopoverTitle>
					<PopoverDescription className="text-xs leading-relaxed">
						{state === "on" || state === "off" || state === "loading" ? PUSH_PITCH : PUSH_HELP[state]}
					</PopoverDescription>
				</PopoverHeader>
				{state === "unavailable" && missing.length > 0 && (
					<p className="rounded-md bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
						Missing on the server: <span className="tnum font-medium text-foreground">{missing.join(", ")}</span>
					</p>
				)}
				{error && <p role="alert" className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
				{(state === "off" || state === "loading") && (
					<Button onClick={() => void enable()} disabled={busy || state === "loading"}>
						{busy ? <Loader2 className="animate-spin" /> : <Bell className="size-4" />}
						Turn on notifications
					</Button>
				)}
				{on && (
					<div className="flex gap-2">
						<Button variant="outline" className="flex-1" onClick={() => void test()} disabled={testing}>
							{testing ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
							Send test
						</Button>
						<Button variant="ghost" className="flex-1" onClick={() => void disable()} disabled={busy}>
							{busy ? <Loader2 className="animate-spin" /> : <BellOff className="size-4" />}
							Turn off
						</Button>
					</div>
				)}
				{on && <p className="text-[11px] text-muted-foreground">On for this device. Turn it on on your phone too.</p>}
			</PopoverContent>
		</Popover>
	);
}
