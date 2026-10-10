#!/usr/bin/env bash
# ============================================================
# Tạo Secret "optipackai-be-env" cho Kubernetes từ chính be/.env
#
#   bash scripts/k8s-create-secret.sh            # namespace mặc định: optipackai
#   bash scripts/k8s-create-secret.sh my-ns
#
# VÌ SAO CẦN SCRIPT NÀY thay vì gọi thẳng
# `kubectl create secret generic ... --from-env-file=be/.env`:
# file be/.env thật của dự án có 2 dạng dòng mà kubectl KHÔNG xử lý giống
# thư viện dotenv của Node:
#   1. Key có khoảng trắng đứng trước (" TOKEN_ENCRYPTION_KEY=...") -> kubectl
#      báo lỗi "not a valid key name".
#   2. Value bọc trong dấu nháy (JWT_SECRET="abc") -> dotenv BỎ nháy, còn
#      kubectl giữ nguyên cả dấu nháy vào giá trị. Hậu quả rất khó phát hiện:
#      trong cụm, token được ký bằng chuỗi khác với khi chạy local.
# Script chuẩn hoá 2 điểm đó rồi mới nạp vào Secret.
# ============================================================
set -euo pipefail

NAMESPACE="${1:-optipackai}"
ENV_FILE="${ENV_FILE:-be/.env}"
SECRET_NAME="${SECRET_NAME:-optipackai-be-env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Không tìm thấy $ENV_FILE — chạy script này ở thư mục gốc repo." >&2
  exit 1
fi

TMP_ENV="$(mktemp)"
# Xoá file tạm chứa bí mật trong MỌI trường hợp thoát, kể cả khi lỗi.
trap 'rm -f "$TMP_ENV"' EXIT

awk '
  # bỏ dòng trống và dòng chú thích
  /^[[:space:]]*$/ { next }
  /^[[:space:]]*#/ { next }
  {
    line = $0
    sub(/\r$/, "", line)                      # bỏ CR của file lưu kiểu Windows
    pos = index(line, "=")
    if (pos == 0) next                        # dòng không có "=" thì bỏ qua
    key = substr(line, 1, pos - 1)
    val = substr(line, pos + 1)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
    gsub(/[[:space:]]+$/, "", val)            # khoảng trắng thừa cuối dòng
    # bỏ cặp nháy bao ngoài (giống cách dotenv làm)
    if (length(val) >= 2) {
      first = substr(val, 1, 1); last = substr(val, length(val), 1)
      if ((first == "\"" && last == "\"") || (first == "'"'"'" && last == "'"'"'"))
        val = substr(val, 2, length(val) - 2)
    }
    if (key ~ /^[A-Za-z_][A-Za-z0-9_.-]*$/) print key "=" val
  }
' "$ENV_FILE" > "$TMP_ENV"

echo "Số biến sẽ nạp vào Secret: $(wc -l < "$TMP_ENV")"

kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"

# --dry-run + apply: chạy lại được nhiều lần, tự cập nhật Secret đã có.
kubectl -n "$NAMESPACE" create secret generic "$SECRET_NAME" \
  --from-env-file="$TMP_ENV" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Đã tạo/cập nhật Secret $SECRET_NAME trong namespace $NAMESPACE."
echo "Các key có trong Secret (không in giá trị):"
kubectl -n "$NAMESPACE" get secret "$SECRET_NAME" -o go-template='{{range $k, $v := .data}}  {{$k}}{{"\n"}}{{end}}'
