import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicHome from "@/components/PublicHome";

const { getUser, createClient } = vi.hoisted(() => ({
  getUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

import Home from "@/app/page";

describe("public home page", () => {
  beforeEach(() => {
    getUser.mockReset();
    createClient.mockReset();
    createClient.mockResolvedValue({ auth: { getUser } });
  });

  it("explains VAIVIA and links to login and account creation", () => {
    render(<PublicHome />);

    expect(
      screen.getByRole("heading", { name: /from trip idea to takeoff/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/shared travel-planning home/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
    expect(
      screen
        .getAllByRole("link", { name: "Create account" })
        .every((link) => link.getAttribute("href") === "/auth/sign-up"),
    ).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Plan together" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stay on budget" }),
    ).toBeInTheDocument();
  });

  it("serves the public home at the root when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await Home();

    expect(getUser).toHaveBeenCalledOnce();
    expect(result.type).toBe(PublicHome);
  });

  it("preserves the signed-in dashboard experience", async () => {
    const user = { id: "user-1", email: "traveller@example.com" };
    getUser.mockResolvedValue({ data: { user }, error: null });

    const result = await Home();

    expect(getUser).toHaveBeenCalledOnce();
    expect(result.type).not.toBe(PublicHome);
    expect(result.props.children.props.user).toBe(user);
  });
});
