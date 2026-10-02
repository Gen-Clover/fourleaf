import type { ToolNav } from "@genclover/ui/nav";

// Won deal → onboard the client → agreements (NDA, MSA, SOW, change requests) → hand over to Delivery.
export const clientsNav: ToolNav = {
  tool: "Clients & Agreements",
  home: "/clients/onboarding",
  sections: [
    { items: [{ href: "/clients/onboarding", label: "Onboarding", icon: "➜", description: "Won deals waiting to become clients" }] },
    { items: [{ href: "/clients", label: "Clients", icon: "◉", description: "Client records, contacts, billing and tax details" }] },
    { items: [{ href: "/agreements", label: "Agreements", icon: "§", description: "NDA, MSA, SOW, change requests, acceptance, renewals" }] },
  ],
};
