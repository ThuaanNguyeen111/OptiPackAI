export const SHIPMENT_ERROR_CODES = {
  NOT_FOUND: 'SHP_NOT_FOUND',
  INVALID_ID: 'SHP_INVALID_ID',
  ALREADY_EXISTS: 'SHP_ALREADY_EXISTS', // nhóm đơn đã có vận đơn
  GROUP_NOT_READY: 'SHP_GROUP_NOT_READY', // nhóm đơn chưa đóng gói xong
  INVALID_TRANSITION: 'SHP_INVALID_TRANSITION',
  STATE_CONFLICT: 'SHP_STATE_CONFLICT', // version không khớp
  NOTE_REQUIRED: 'SHP_NOTE_REQUIRED', // lý do "other" phải có ghi chú
} as const;
