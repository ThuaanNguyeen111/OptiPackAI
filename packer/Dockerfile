# ============================================================
# OptiPackAI — packer (CP-SAT, Python)
#
#   docker build -f packer/Dockerfile -t optipackai-packer:local .
#
# Build context là THƯ MỤC GỐC repo (giống các image khác) để dùng chung
# .dockerignore ở gốc. Service nội bộ: chỉ backend gọi, không publish ra
# Ingress, không cần bí mật nào.
# ============================================================
ARG PYTHON_VERSION=3.12-slim

FROM python:${PYTHON_VERSION} AS runner
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# Cài dependency trước (lớp cache), rồi mới copy mã nguồn.
COPY packer/pyproject.toml ./
RUN python -c "import tomllib; d=tomllib.load(open('pyproject.toml','rb')); print('\n'.join(d['project']['dependencies']))" > requirements.txt \
 && pip install -r requirements.txt

COPY packer/packer ./packer

RUN groupadd --gid 1001 app && useradd --uid 1001 --gid app --no-create-home app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3).status == 200 else 1)"

# 1 worker: CP-SAT đã tự dùng nhiều luồng bên trong mỗi lời giải.
CMD ["uvicorn", "packer.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
