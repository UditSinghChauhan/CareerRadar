import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Application } from "@workspace/api-client-react";
import { ApplicationBoard } from "../application-board";
import { BOARD_STAGES, STATUS_ORDER, stageOf } from "../status";

const app = (id: string, status: string, title = `Role ${id}`) =>
  ({
    id,
    clerkId: "u",
    jobId: `j${id}`,
    status,
    createdAt: "2026-11-01T00:00:00.000Z",
    job: { id: `j${id}`, title, company: { name: "Invented Co" } },
  }) as unknown as Application;

describe("board stages", () => {
  it("place every status in exactly one of six columns", () => {
    expect(BOARD_STAGES).toHaveLength(6);
    const placed = BOARD_STAGES.flatMap((s) => [...s.statuses]);
    expect([...placed].sort()).toEqual([...STATUS_ORDER].sort());
  });

  it("park an unknown status in Saved, as the grouping does", () => {
    expect(stageOf("ghosted").key).toBe("saved");
  });
});

describe("ApplicationBoard", () => {
  const apps = [
    app("1", "oa_pending"),
    app("2", "oa_completed"),
    app("3", "withdrawn"),
  ];

  it("shows both assessment statuses in one column, naming the finer one", () => {
    render(
      <ApplicationBoard
        applications={apps}
        onStatusChange={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    const col = screen.getByTestId("board-column-oa_pending");
    expect(within(col).getAllByTestId("board-card")).toHaveLength(2);
    expect(within(col).getByText("OA done")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("board-column-rejected")).getByText(
        "Withdrawn",
      ),
    ).toBeInTheDocument();
  });

  it("moves a card to a column's status, and leaves it alone within its own stage", () => {
    const onStatusChange = vi.fn();
    render(
      <ApplicationBoard
        applications={apps}
        onStatusChange={onStatusChange}
        onOpen={vi.fn()}
      />,
    );
    const done = screen.getByLabelText(/Role 2 at/);
    fireEvent.dragStart(done);
    fireEvent.drop(screen.getByTestId("board-column-oa_pending"));
    expect(onStatusChange).not.toHaveBeenCalled();

    fireEvent.dragStart(done);
    fireEvent.drop(screen.getByTestId("board-column-interview_pending"));
    expect(onStatusChange).toHaveBeenCalledWith("2", "interview_pending");
  });
});
