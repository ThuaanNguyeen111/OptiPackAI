export const PACKAGING_ERROR_CODES = {
  INVALID_RECOMMENDATION_ID: 'PKG_INVALID_RECOMMENDATION_ID',
  RECOMMENDATION_NOT_FOUND: 'PKG_RECOMMENDATION_NOT_FOUND',
  NO_ACTIVE_RECOMMENDATION: 'PKG_NO_ACTIVE_RECOMMENDATION', // group chưa có recommendation nào (chưa generate)
  ALREADY_DECIDED: 'PKG_ALREADY_DECIDED', // recommendation đã Approve/Adjust/Reject trước đó, không cho quyết định lại
  GROUP_NOT_PENDING_APPROVAL: 'PKG_GROUP_NOT_PENDING_APPROVAL', // group không ở đúng trạng thái pending_approval khi Approve/Adjust/Reject
} as const;
