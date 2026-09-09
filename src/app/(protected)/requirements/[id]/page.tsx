"use client";

import { clientPage } from "@/lib/clientPage";
import { useParams } from "@/lib/router";

const RequirementDetail = clientPage(() => import("@/views/RequirementDetail"));

// Keyed by id so the component remounts when navigating between requirements,
// matching the old RequirementDetailRoute behavior.
export default function RequirementDetailPage() {
    const { id } = useParams<{ id: string }>();
    return <RequirementDetail key={id} />;
}
