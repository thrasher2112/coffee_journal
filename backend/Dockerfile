FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml ./
COPY alembic ./alembic
COPY alembic.ini ./
COPY src ./src
COPY start.sh ./start.sh

RUN chmod +x /app/start.sh

CMD ["./start.sh"]
