import { createFileRoute } from "@tanstack/react-router";
import { ProgressDashboard } from "@/components/ProgressDashboard";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — A/L Command Center" },
      { name: "description", content: "Study time, completed and missed work, paper marks." },
      { property: "og:title", content: "Progress — A/L Command Center" },
      {
        property: "og:description",
        content: "Study time, completed and missed work, paper marks.",
      },
    ],
  }),
  component: ProgressDashboard,
});
