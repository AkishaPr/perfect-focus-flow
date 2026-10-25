import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventDialog } from "@/components/EventDialog";
import type { CalEvent } from "@/lib/types";

const base: CalEvent = {
  id: "e1",
  title: "Physics class",
  kind: "class",
  mode: "physical",
  recurrence: "none",
  date: "2026-10-20",
  start: "14:00",
  end: "16:00",
};

const open = (e: CalEvent) => render(<EventDialog open onOpenChange={() => {}} initial={e} />);

afterEach(cleanup);

describe("EventDialog validation", () => {
  it("allows saving a one-time event that has a date", () => {
    open(base);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByText(/Pick a date/)).toBeNull();
  });

  it("blocks a one-time event with no date (it would never show on the calendar)", () => {
    open({ ...base, date: "" });
    expect(screen.getByText("Pick a date for a one-time event.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("does not require a date for weekly events", () => {
    open({ ...base, recurrence: "weekly", weekday: 2, date: "" });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("allows an overnight event and explains its end date", () => {
    open({ ...base, start: "23:09", end: "02:29" });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByText("Ends the following day at 02:29.")).toBeInTheDocument();
  });
  it("rejects an empty time or equal start and end", () => {
    open({ ...base, start: "14:00", end: "14:00" });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    cleanup();
    open({ ...base, start: "" });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
