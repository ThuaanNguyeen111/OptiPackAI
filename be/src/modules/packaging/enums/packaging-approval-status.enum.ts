export enum PackagingApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  ADJUSTED = 'adjusted',
  REJECTED = 'rejected',
}

// Rule #11 (CLAUDE.md) — mảng đã lọc, tránh reverse-mapping.
export const PACKAGING_APPROVAL_STATUS_VALUES = Object.values(PackagingApprovalStatus);
