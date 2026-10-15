import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — A/L Command Center" },
      { name: "description", content: "Fixed events, today's plan and your next task." },
      { property: "og:title", content: "Today — A/L Command Center" },
      { property: "og:description", content: "Fixed events, today's plan and your next task." },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  return (
    <>
      <PageHeader title="Today" subtitle="Fixed events, today's plan and your next task." />
      <ComingSoon stage="stage 5" />
    </>
  );
}
