"use client";

import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Password `Input` with a show/hide toggle. Forwards its ref so it drops
 * straight into `register()` from react-hook-form. */
const PasswordInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input>>(
	({ className, ...props }, ref) => {
		const [visible, setVisible] = useState(false);
		return (
			<div className="relative">
				<Input
					ref={ref}
					type={visible ? "text" : "password"}
					className={cn("pr-9", className)}
					{...props}
				/>
				<button
					type="button"
					tabIndex={-1}
					onClick={() => setVisible((v) => !v)}
					aria-label={visible ? "Hide password" : "Show password"}
					className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground transition-colors hover:text-foreground"
				>
					{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
				</button>
			</div>
		);
	},
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
