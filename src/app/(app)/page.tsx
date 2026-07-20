"use client";

import SettlementAuditor from "@/app/components/SettlementAuditor";

// Settlement Audit ("/"). Reads master + audit state from the providers mounted
// in the (app) layout, so leaving and returning keeps the in-progress audit.
export default function AuditPage() {
	return <SettlementAuditor />;
}
