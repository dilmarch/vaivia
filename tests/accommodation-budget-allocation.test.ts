import { describe, expect, it } from "vitest";
import { stayMutationInputFromFormData } from "@/lib/accommodations/mutations";

describe("accommodation budget allocation", () => {
  it("preserves payer and split selections when a stay is normalized", () => {
    const form = new FormData();
    form.set("hotel_name", "Hotel Example");
    form.set("check_in_date", "2026-11-01");
    form.set("check_out_date", "2026-11-02");
    form.set("cost", "100");
    form.set("currency", "CAD");
    form.set("split_method", "exact");
    form.set("paid_by", "member:member-b");
    form.append("included_participants", "member:member-a");
    form.append("included_participants", "member:member-b");
    form.set("split_amount_member_member-a", "40");
    form.set("split_amount_member_member-b", "60");

    expect(stayMutationInputFromFormData(form)).toMatchObject({
      splitMethod: "exact",
      paidBy: "member:member-b",
      includedParticipants: ["member:member-a", "member:member-b"],
      splitAmounts: {
        "member:member-a": "40",
        "member:member-b": "60",
      },
    });
  });
});
