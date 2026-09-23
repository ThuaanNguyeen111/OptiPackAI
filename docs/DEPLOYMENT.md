# Triển khai OptiPackAI — Docker Compose, Kubernetes, CI/CD

Tài liệu này mô tả **hiện trạng thật** sau đợt sửa ngày 16/09/2026. Phần chạy thử
Kubernetes chi tiết nằm ở [`k8s/README.md`](../k8s/README.md).

---

## 1. Kiến trúc triển khai

```
                    ┌──────────────┐
  trình duyệt ────► │  fe (nginx)  │  cổng 8080 trong container → 5173 ở host
                    └──────────────┘
                    ┌──────────────┐
  trình duyệt ────► │  storefront  │  Next.js standalone, cổng 3001
                    └──────┬───────┘
                           │ (gọi API)
                    ┌──────▼───────┐        ┌─────────┐
  trình duyệt ────► │  be (NestJS) │ ─────► │  redis  │  cache trạng thái auth
                    └──────┬───────┘        └─────────┘
                           │
                    ┌──────▼─────────────┐
                    │ MongoDB Atlas      │  KHÔNG chạy trong cụm — xem mục 4
                    └────────────────────┘
```

3 image, **tất cả đều build với build context là THƯ MỤC GỐC repo** vì đây là npm
workspaces dùng chung một `package-lock.json`:

| Image | Dockerfile | Cổng | Ghi chú |
|---|---|---|---|
| `optipackai-be` | `be/Dockerfile` | 3000 | multi-stage, chạy bằng user `nestjs` (uid 1001), entry `dist/src/main.js` |
| `optipackai-fe` | `fe/Dockerfile` | 8080 | build Vite → nginx-unprivileged, có SPA fallback + `/healthz` |
| `optipackai-storefront` | `storefront/Dockerfile` | 3001 | Next.js `output: 'standalone'` |

---

## 2. Chạy bằng Docker Compose

```bash
cp .env.example .env          # chỉ khi cần đổi cổng / URL mặc định
docker compose up -d --build  # redis + be + fe + storefront
docker compose logs -f be
docker compose down
```

- Backend đọc biến thật từ `be/.env` (`env_file`), compose chỉ ghi đè `REDIS_HOST=redis`,
  `PORT`, `NODE_ENV`, `CORS_ORIGIN`.
- Cần MongoDB chạy local (offline, không dùng Atlas):
  `docker compose --profile local-db up -d mongodb mongo-express` — profile này đã bật
  **replica set** sẵn, xem mục 4.

> ⚠️ `VITE_API_URL` và `NEXT_PUBLIC_API_URL` được nhúng vào bundle **lúc build image**.
> Đổi địa chỉ backend ⇒ phải `docker compose build` lại, restart không ăn thua.

---

## 3. Chạy trên Kubernetes

Toàn bộ manifest ở `k8s/`, quản lý bằng kustomize:

```
k8s/base/                 namespace, configmap, redis, be, fe, storefront, ingress
k8s/overlays/local/       image :local build ở máy — dùng để chạy thử
k8s/overlays/ghcr/        image trên ghcr.io do CI đẩy lên — dùng khi deploy thật
```

```bash
docker compose build                                  # 1. build 3 image
kubectl create namespace optipackai                   # 2. tạo namespace
kubectl -n optipackai create secret generic optipackai-be-env \
  --from-env-file=be/.env                             # 3. nạp bí mật từ .env
kubectl apply -k k8s/overlays/local                   # 4. deploy
kubectl -n optipackai get pods -w
```

Hướng dẫn đầy đủ (dựng cluster bằng Docker Desktop hoặc kind, ingress, port-forward,
bảng gỡ lỗi): [`k8s/README.md`](../k8s/README.md).

Secret **cố ý không nằm trong repo** — nạp thẳng từ `be/.env` bằng `--from-env-file`.

---

## 4. MongoDB: vì sao không nằm trong cụm

Dự án dùng **MongoDB Atlas** (đã chốt trong `CLAUDE.md`). Điểm bắt buộc phải nhớ:
`packaging.service.ts` dùng `session.withTransaction()`, mà **transaction chỉ chạy được
trên replica set**. Atlas luôn là replica set kể cả gói free, nên không cần làm gì thêm.

Ngược lại, `docker-compose.yml` **bản cũ chạy `mongo:7` standalone** → nếu ai đó trỏ
`MONGODB_URI` vào đó thì mọi thao tác approve/adjust/reject packaging sẽ lỗi ngay. Bản mới
chạy `mongod --replSet rs0` và tự `rs.initiate()` trong healthcheck.

Nếu sau này muốn tự host Mongo trong Kubernetes: bắt buộc StatefulSet + replica set + PVC +
kế hoạch backup — không phải chuyện thêm một Deployment là xong.

---

## 5. CI/CD

### `.github/workflows/ci.yml` — chạy mọi nhánh và mọi PR vào `main`

| Job | Nội dung | Chặn PR? |
|---|---|---|
| `be` | `tsc --noEmit`, `npm run lint:ci`, `jest` | ✅ |
| `fe` | `npm run build` (đã gồm `tsc -b`) | ✅ |
| `fe` (bước lint) | `eslint .` | ❌ tạm `continue-on-error` — xem mục 6 |
| `storefront` | `tsc --noEmit` + `next build`, tự bỏ qua nếu chưa commit thư mục | ✅ |
| `docker` | build cả 3 image (không push), có cache GHA | ✅ |
| `k8s` | `kubectl kustomize` + `kubeconform -strict` | ✅ |

Điểm đã sửa so với bản cũ:

- Bản cũ gọi `npm run lint` của `be`, mà script đó có `--fix` → trong CI nó **tự sửa file rồi
  báo xanh**, che mất lỗi thật. Nay dùng script mới `lint:ci` (không `--fix`).
- Bản cũ chỉ có đúng 1 job backend — FE/storefront/Docker/k8s không được kiểm tra gì.
- Thêm `concurrency.cancel-in-progress` để push liên tiếp không xếp hàng chờ.

### `.github/workflows/release.yml` — đẩy image lên GHCR

Chạy khi push `main`, khi gắn tag `v*`, hoặc bấm tay (`workflow_dispatch`, cho phép nhập
`api_url` để build đúng URL backend). Tag image: tên nhánh, semver, sha ngắn, `latest`.

**Cố ý không tự động `kubectl apply` lên cụm nào** — CI chỉ tạo image, việc deploy do người
chạy, tránh CI tự đụng vào môi trường thật khi chưa có quy trình duyệt.

---

## 6. Việc còn nợ (biết trước, không phải lỗi ẩn)

1. **9 lỗi + 3 cảnh báo ESLint ở FE** (`WarehousePage.tsx`, `ProfilePage.tsx`,
   `OrderDetailDrawer.tsx`… — `react-hooks/set-state-in-effect`, `react-refresh/only-export-components`)
   có sẵn từ nhánh `feature/viet_ui`. Đang để `continue-on-error: true`; dọn xong thì bỏ cờ đó.
2. **`storefront/` chưa được commit** (đang là file chưa track ở máy). Job `storefront` và
   bước build image storefront tự bỏ qua khi thiếu, nên CI không đỏ — nhưng deploy sẽ thiếu
   storefront cho tới khi commit.
3. **Chưa có TLS/cert-manager và domain thật** — đang dùng host `*.optipackai.local` qua file
   `hosts`, chỉ hợp cho chạy thử.
4. **Chưa có HPA / PodDisruptionBudget / resource tuning theo tải thật** — số `requests/limits`
   hiện tại là ước lượng khởi đầu, cần đo lại khi có dữ liệu.
