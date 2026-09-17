# Chạy thử OptiPackAI trên Kubernetes

Toàn bộ quy trình dưới đây **đã chạy thật và thành công trên máy này** (16/09/2026):
cluster `docker-desktop` (Kubernetes v1.36.1), 4 pod `Running`, cả 3 app trả HTTP 200.

---

## Bước 0 — Điều kiện máy Windows: phải có WSL2

Đây là rào cản THẬT đã gặp, không phải lý thuyết: Windows 11 **Home** không có Hyper-V, nên
Docker Desktop bắt buộc chạy trên WSL2. Thiếu WSL, Docker Desktop báo `hasNoVirtualization: true`
và engine không bao giờ khởi động được (`docker desktop status` → `stopped`).

Kiểm tra: `wsl --status`. Nếu báo "The Windows Subsystem for Linux is not installed":

```powershell
# PowerShell chạy bằng quyền Administrator
wsl --install --no-distribution   # --no-distribution: Docker Desktop tự mang distro riêng
```

rồi **khởi động lại máy** (2 thành phần Windows vừa bật chỉ có hiệu lực sau reboot).

## Bước 0b — Dựng cluster

### Cách A (khuyến nghị trên Windows): bật Kubernetes sẵn có trong Docker Desktop

Docker Desktop → **Settings → Kubernetes → Enable Kubernetes → Apply & Restart** (lần đầu mất
~5 phút để tải image của cluster).

```bash
kubectl config use-context docker-desktop
kubectl get nodes        # phải thấy 1 node Ready
```

Bản Docker Desktop hiện tại dựng cluster bằng **kind** bên trong (log ghi `kubernetes starting:
{"mode":"kind"}`, node tên `desktop-control-plane`) — nhưng **đã kiểm chứng: image build bằng
`docker build`/`docker compose build` ở máy vẫn dùng được ngay**, pod khởi động bình thường với
`imagePullPolicy: IfNotPresent`, **không cần registry, không cần `kind load`**.

### Cách B: kind tự cài riêng (nếu không muốn bật k8s trong Docker Desktop)

```bash
winget install Kubernetes.kind
kind create cluster --name optipackai
```

Với cluster kind tự dựng (khác cluster của Docker Desktop ở trên), image **không** tự thấy —
sau khi build phải nạp thủ công:

```bash
kind load docker-image optipackai-be:local optipackai-fe:local optipackai-storefront:local --name optipackai
```

---

## Bước 1 — Build 3 image ở máy

```bash
# Chạy ở thư mục gốc repo. Build context là gốc vì đây là npm workspaces.
docker compose build
```

Hoặc build thẳng từng cái:

```bash
docker build -f be/Dockerfile         -t optipackai-be:local .
docker build -f fe/Dockerfile         -t optipackai-fe:local         --build-arg VITE_API_URL=http://api.optipackai.local .
docker build -f storefront/Dockerfile -t optipackai-storefront:local --build-arg NEXT_PUBLIC_API_URL=http://api.optipackai.local .
```

> ⚠️ `VITE_API_URL` / `NEXT_PUBLIC_API_URL` bị **nhúng vào bundle lúc build**. Nếu định vào
> bằng Ingress (`http://api.optipackai.local`) thì phải build với đúng URL đó; nếu định dùng
> `port-forward` thì build với `http://localhost:3000`. Đổi URL = build lại image.

---

## Bước 2 — Tạo Secret từ `be/.env`

Toàn bộ bí mật (MONGODB_URI của Atlas, JWT secret, SMTP, key Lazada…) nạp thẳng từ file `.env`
đang dùng ở máy, **không commit vào repo**:

```bash
bash scripts/k8s-create-secret.sh
```

> ⚠️ Dùng script, **đừng gọi thẳng** `kubectl create secret --from-env-file=be/.env`.
> File `be/.env` thật của dự án có 6 dòng key bị thụt đầu dòng (` TOKEN_ENCRYPTION_KEY=...`)
> — kubectl sẽ báo "not a valid key name" — và 3 dòng value bọc trong dấu nháy
> (`JWT_SECRET="..."`). dotenv của Node **bỏ** dấu nháy còn kubectl **giữ nguyên**, nên token
> trong cụm sẽ được ký bằng chuỗi khác với khi chạy local — lỗi rất khó truy ra.
> Script `scripts/k8s-create-secret.sh` chuẩn hoá đúng 2 điểm đó rồi mới tạo Secret
> (chạy lại nhiều lần được, tự cập nhật Secret cũ).

Kiểm tra nhanh (chỉ in TÊN biến, không in giá trị):

```bash
kubectl -n optipackai get secret optipackai-be-env -o jsonpath='{.data}' | tr ',' '\n' | cut -d'"' -f2
```

Khi sửa `.env` thì tạo lại rồi restart backend:

```bash
bash scripts/k8s-create-secret.sh
kubectl -n optipackai rollout restart deploy/be
```

---

## Bước 3 — Deploy

```bash
kubectl apply -k k8s/overlays/local
kubectl -n optipackai get pods -w
```

Mong đợi 4 pod `Running`: `be`, `fe`, `storefront`, `redis`.

---

## Bước 4 — Mở ứng dụng

### Không cần cài gì thêm: port-forward

```bash
kubectl -n optipackai port-forward svc/be 3000:3000
kubectl -n optipackai port-forward svc/fe 5173:80
kubectl -n optipackai port-forward svc/storefront 3001:3001
```

→ FE `http://localhost:5173`, API `http://localhost:3000/api/docs`, storefront `http://localhost:3001`.
(Chạy 3 lệnh ở 3 cửa sổ terminal khác nhau; mỗi lệnh chiếm 1 terminal.)

### Hoặc qua Ingress (giống production hơn)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.3/deploy/static/provider/cloud/deploy.yaml
kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller
```

Thêm vào `C:\Windows\System32\drivers\etc\hosts` (mở Notepad bằng quyền Administrator):

```
127.0.0.1 app.optipackai.local api.optipackai.local shop.optipackai.local
```

→ `http://app.optipackai.local`, `http://api.optipackai.local`, `http://shop.optipackai.local`.

---

## Gỡ lỗi nhanh

| Hiện tượng | Cách xem | Nguyên nhân hay gặp |
|---|---|---|
| Pod `ErrImageNeverPull` / `ImagePullBackOff` | `kubectl -n optipackai describe pod <tên>` | Chưa build image, hoặc dùng kind mà quên `kind load docker-image` |
| `be` `CrashLoopBackOff` | `kubectl -n optipackai logs deploy/be` | Thiếu biến trong Secret (JWT secret, MONGODB_URI), hoặc IP máy chưa được whitelist trong Atlas Network Access |
| `be` chạy nhưng FE gọi API lỗi CORS | `kubectl -n optipackai logs deploy/be` | `CORS_ORIGIN` trong `k8s/base/configmap.yaml` chưa khớp URL đang mở FE |
| FE gọi sai địa chỉ backend | Xem tab Network của trình duyệt | Image FE build bằng `VITE_API_URL` khác với cách đang truy cập |
| `be` log `ioredis ECONNREFUSED ...:6379` lúc mới deploy | `kubectl -n optipackai logs deploy/be --since=60s` | **Bình thường**: pod `be` khởi động trước pod `redis` vài giây; ioredis tự kết nối lại, log tự dứt. Chỉ đáng lo nếu lỗi CÒN tiếp diễn sau khi `redis` đã `Running`. |

Xoá sạch khi thử xong:

```bash
kubectl delete -k k8s/overlays/local
kubectl delete namespace optipackai
```

---

## Những gì CỐ Ý không đưa vào cụm

- **MongoDB**: dự án dùng **Atlas** (đã chốt trong `CLAUDE.md`). Atlas luôn là replica set nên
  `session.withTransaction()` trong `packaging.service.ts` chạy được. Nếu tự host Mongo trong
  cluster thì **bắt buộc** phải cấu hình replica set, không thì mọi transaction sẽ lỗi.
- **PersistentVolume cho Redis**: Redis ở đây chỉ là cache trạng thái auth, mất thì tự dựng lại
  từ Mongo — dùng `emptyDir` cho nhẹ.
- **HPA/autoscaling, TLS/cert-manager**: chưa cần cho mục đích chạy thử; thêm sau khi có domain thật.
