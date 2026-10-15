import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon, PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/week")({
  head: () => ({
    meta: [
      { title: "Week — A/L Command Center" },
      { name: "description", content: "Recurring classes, events and planned study blocks." },
      { property: "og:title", content: "Week — A/L Command Center" },
      { property: "og:description", content: "Recurring classes, events and planned study blocks." },
    ],
  }),
  component: WeekPage,
});

function WeekPage() {
  return (
    <>
      <PageHeader title="Week" subtitle="Recurring classes, events and planned study blocks." />
      <ComingSoon stage="stage 2" />
    </>
  );
}
