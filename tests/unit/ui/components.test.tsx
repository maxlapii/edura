import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert, Badge, Button, EmptyState, Field, Input, Pagination, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR, Tabs } from "@/components/ui";

describe("StatusBadge", () => {
  it("humanises status values and picks a tone", () => {
    render(<StatusBadge status="IN_PROGRESS" />);
    const badge = screen.getByText("In progress");
    expect(badge.className).toContain("bg-brand-50");
    render(<StatusBadge status="ABSENT" />);
    expect(screen.getByText("Absent").className).toContain("bg-rose-50");
    render(<StatusBadge status={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("StatCard / Alert / EmptyState", () => {
  it("renders label, value, hint and links when href is given", () => {
    render(<StatCard label="Lessons today" value={4} hint="2 covered" href="/schedule" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/schedule");
    expect(screen.getByText("Lessons today")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2 covered")).toBeInTheDocument();
  });
  it("alerts are announced with role=alert", () => {
    render(
      <Alert tone="error" title="Failed">
        Something broke
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke");
  });
  it("empty state shows title, description and action", () => {
    render(<EmptyState title="Nothing here" description="Try later" action={<Button>Add</Button>} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

describe("Field / Input", () => {
  it("associates label, marks required and shows errors over hints", () => {
    render(
      <Field label="Email" htmlFor="email" required hint="We never share it" error="Invalid email">
        <Input id="email" />
      </Field>,
    );
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
    expect(screen.queryByText("We never share it")).not.toBeInTheDocument();
  });
});

describe("Pagination / Tabs / Table", () => {
  it("renders nothing for a single page and prev/next links otherwise", () => {
    const { container } = render(<Pagination page={1} totalPages={1} hrefFor={(p) => `/x?page=${p}`} />);
    expect(container).toBeEmptyDOMElement();
    render(<Pagination page={2} totalPages={3} hrefFor={(p) => `/x?page=${p}`} />);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/x?page=1");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/x?page=3");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });
  it("marks the current tab and shows counts", () => {
    render(<Tabs current="/a/b" items={[{ href: "/a", label: "A", count: 3 }, { href: "/c", label: "C" }]} />);
    expect(screen.getByRole("link", { name: /A/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "C" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  it("table primitives compose", () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>Ada</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ada" })).toBeInTheDocument();
    render(<Badge tone="green">ok</Badge>);
    expect(screen.getByText("ok").className).toContain("bg-accent-50");
  });
});
