// Fields that hold money on projects and their resources. Pages open to roles without "finance.view"
// (delivery managers, onboarding) leave them out of their queries, so the figures never leave the server.
export const projectMoney = (hide: boolean) => ({ agreedMonthly: hide, agreedBlendedRate: hide, agreedExtraRate: hide, agreementNotes: hide, allocationSnapshot: hide });
export const resourceMoney = (hide: boolean) => ({ quotedRate: hide, agreedRate: hide, standardRate: hide, floorRate: hide });
