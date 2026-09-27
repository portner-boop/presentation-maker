# Запуск presentation-maker

Инструкция для локальной разработки, демо и прод-запуска в Docker.

## Что понадобится

| Что                              | Версия              | Зачем                                        |
| -------------------------------- | ------------------- | -------------------------------------------- |
| Node.js                          | 22.12+              | api, воркеры, cli, сборка web                |
| pnpm                             | 12 (через corepack) | монорепа                                     |
| Docker                           | с Compose v2        | Postgres и Redis для разработки, прод-образы |
| Ключ OpenAI-совместимого LLM API | —                   | генерация и тон бренда                       |
| LibreOffice + poppler            | любая свежая        | картинки-превью слайдов (необязательно)      |
| git                              | любая               | git-ссылки в материалах (необязательно)      |

pnpm нужной версии включается через corepack, версия зафиксирована в `package.json`:

```bash
corepack enable
```

LibreOffice и poppler на macOS:

```bash
brew install --cask libreoffice && brew install poppler
```

Без них всё работает, просто вместо картинок слайдов интерфейс покажет текстовое превью.

## Первый запуск

**1. Зависимости**

```bash
pnpm install
```

**2. Postgres и Redis**

```bash
pnpm infra:up
```

Postgres поднимается на `localhost:5433`, Redis — на `localhost:6380`. Порты нестандартные, чтобы не конфликтовать с другими проектами.

Если у Docker мало места или нужна быстрая одноразовая база, можно держать её в памяти. Данные пропадут при остановке контейнеров:

```bash
pnpm infra:up:memory
```

**3. Настройки api**

```bash
cp -n apps/api/.env.example apps/api/.env
```

`-n` не перезапишет уже существующий `.env`. В нём обязательно заполнить доступ к LLM:

```dotenv
LLM_BASE_URL=https://your-gateway/v1
LLM_API_KEY=...
LLM_MODEL=openai/gpt-5.4-nano
```

Файл в `.gitignore`, ключ в репозиторий не попадёт. Остальные значения по умолчанию подходят для локального запуска, полный список — в разделе [Переменные окружения](#переменные-окружения).

**4. Миграции базы**

```bash
pnpm db:migrate
```

**5. Запуск**

```bash
pnpm dev
```

Команда собирает общие пакеты и параллельно запускает всё в watch-режиме:

| Что       | Адрес                      |
| --------- | -------------------------- |
| Интерфейс | http://localhost:5173      |
| api       | http://localhost:3000      |
| Swagger   | http://localhost:3000/docs |

Интерфейс ходит в api через прокси Vite (`/api` → `localhost:3000`), CORS настраивать не нужно.

## Проверка, что всё работает

В левом нижнем углу интерфейса должно быть «Сервис работает». То же самое из терминала:

```bash
pnpm cli health
```

Ожидаемый ответ: `api: ok, db: up, redis: up`.

## Первая презентация

**Через интерфейс**

1. «Шаблоны» → перетащить брендовый `.pptx` со слайдами-образцами. Анализ занимает несколько секунд, статус сменится на «Готов».
2. «Новая презентация» → шаблон, задача («Финал хакатона, аудитория — жюри…»), длительность, материалы: папка, `.zip`, файлы или git-ссылка на публичный репозиторий.
3. «Сгенерировать» — откроется экран генерации с этапами, через 10–20 секунд появятся слайды и текст спикера. «Сгенерировать и начать ещё одну» оставляет форму заполненной, чтобы запустить три подряд.

**Через cli**

```bash
pnpm cli templates upload ./brand.pptx --name "Бренд" --wait
```

```bash
pnpm cli presentations create -t <template-id> -b "Финал хакатона, аудитория — жюри" -s . -d 7 -o final.pptx
```

Проверка главного требования — три презентации параллельно укладываются в 5 минут:

```bash
pnpm cli bench -t <template-id> -b "Финал хакатона" -s . -d 7
```

`<template-id>` берётся из `pnpm cli templates list`. У всех команд есть `--help`.

## Остановка и сброс

Остановить `pnpm dev` — `Ctrl+C`. Остановить базы:

```bash
pnpm infra:down
```

Полностью очистить базу и Redis (удаляет тома с данными):

```bash
docker compose -f infra/dev/docker-compose.yml down -v
```

Загруженные шаблоны, готовые `.pptx` и превью лежат в `apps/api/storage/` — эту папку можно удалить вместе с базой.

## Полезные команды

| Команда              | Что делает                                             |
| -------------------- | ------------------------------------------------------ |
| `pnpm build`         | сборка всех пакетов                                    |
| `pnpm typecheck`     | проверка типов во всей монорепе                        |
| `pnpm test`          | тесты (сейчас в `apps/ml`)                             |
| `pnpm format`        | prettier                                               |
| `pnpm db:migrate`    | применить миграции и создать новую по изменениям схемы |
| `pnpm db:studio`     | Prisma Studio для просмотра базы                       |
| `pnpm cli <команда>` | cli в dev-режиме, без сборки                           |

## Переменные окружения

`apps/api/.env`:

| Переменная                      | По умолчанию                                           | Описание                                                                                 |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `LLM_BASE_URL`                  | —                                                      | адрес OpenAI-совместимого API, **обязательно для генерации**                             |
| `LLM_API_KEY`                   | —                                                      | ключ API, **обязательно для генерации**                                                  |
| `LLM_MODEL`                     | —                                                      | модель, **обязательно для генерации**                                                    |
| `LLM_MAX_CONCURRENCY`           | `12`                                                   | одновременных запросов к LLM на процесс                                                  |
| `LLM_STRUCTURED_OUTPUT`         | `json_schema`                                          | `json_schema` / `json_object` / `prompt`; клиент сам понизит режим, если сервер не умеет |
| `DATABASE_URL`                  | `postgresql://pm:pm@localhost:5433/presentation_maker` | Postgres                                                                                 |
| `REDIS_URL`                     | `redis://localhost:6380`                               | Redis: очереди и кеш                                                                     |
| `APP_ROLE`                      | `all`                                                  | `all` — http и воркеры в одном процессе, `api` — только http, `worker` — только очереди  |
| `PORT`                          | `3000`                                                 | порт api                                                                                 |
| `STORAGE_DIR`                   | `./storage`                                            | куда складываются файлы (относительно `apps/api`)                                        |
| `GENERATION_CONCURRENCY`        | `3`                                                    | сколько генераций воркер ведёт параллельно                                               |
| `TEMPLATE_ANALYSIS_CONCURRENCY` | `1`                                                    | сколько шаблонов анализируется параллельно                                               |
| `PREVIEW_ENABLED`               | `true`                                                 | рендерить PNG-превью слайдов                                                             |
| `SOFFICE_PATH`, `PDFTOPPM_PATH` | из `PATH`                                              | пути к LibreOffice и poppler, если они не в `PATH`                                       |
| `CACHE_TTL_MS`                  | `3600000`                                              | время жизни кеша профилей шаблонов                                                       |

Для cli и dev-сервера web адрес api меняется через `PM_API_URL` (по умолчанию `http://localhost:3000`). Собранному web можно задать отдельный хост api через `VITE_API_URL` на этапе сборки.

## Частые проблемы

**`No space left on device` при `pnpm infra:up`.** Кончилось место в Docker VM. Посмотреть, что занимает место:

```bash
docker system df
```

Освободить неиспользуемые образы и тома (затронет и другие проекты, сначала проверьте список):

```bash
docker image prune -a && docker volume prune
```

Или временно запустить базы в памяти: `pnpm infra:up:memory`.

**`port is already allocated` для 5433 или 6380.** Порт занят другим контейнером. Задайте свои порты и поправьте `DATABASE_URL` / `REDIS_URL` в `.env`:

```bash
POSTGRES_PORT=5543 REDIS_PORT=6390 pnpm infra:up
```

**`EADDRINUSE: address already in use :::3000`.** Уже запущен другой экземпляр api. Найти процесс:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

**В логах `LLM не настроен`, генерация падает.** Не заполнены `LLM_BASE_URL`, `LLM_API_KEY` или `LLM_MODEL` в `apps/api/.env`. После правки перезапустите `pnpm dev`.

**Превью слайдов текстовые, а не картинки.** Не найдены LibreOffice или poppler — проверьте `soffice --version` и `pdftoppm -v`. Превью строится при генерации и анализе, поэтому уже готовые записи нужно перегенерировать.

**`Invalid environment` при старте api.** Ошибка валидации `.env` — в сообщении указана переменная. Чаще всего это `DATABASE_URL` или `REDIS_URL` без схемы.

**`ERR_PNPM_IGNORED_BUILDS` при установке.** pnpm 12 блокирует postinstall-скрипты незнакомых пакетов. Разрешённые перечислены в `allowBuilds` в `pnpm-workspace.yaml`; новый пакет со скриптом нужно добавить туда же.

## Прод в Docker

```bash
cp -n infra/prod/.env.example infra/prod/.env
```

В `infra/prod/.env` задать `POSTGRES_PASSWORD` и `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Запуск из корня репозитория:

```bash
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env up -d --build
```

| Сервис              | Что делает                                                    | Порт                          |
| ------------------- | ------------------------------------------------------------- | ----------------------------- |
| `postgres`, `redis` | база, очереди, кеш                                            | внутри сети                   |
| `migrate`           | применяет миграции и завершается                              | —                             |
| `api`               | http                                                          | `API_PORT`, по умолчанию 3000 |
| `worker`            | анализ шаблонов, генерация, git, превью (образ с LibreOffice) | —                             |
| `web`               | интерфейс в nginx, `/api` проксируется в api                  | `WEB_PORT`, по умолчанию 8080 |

Интерфейс откроется на http://localhost:8080. Больше параллельных генераций — больше воркеров:

```bash
docker compose -f infra/prod/docker-compose.yml --env-file infra/prod/.env up -d --scale worker=2
```

Файлы хранятся в общем томе `storage`, поэтому api и воркеры должны работать на одной машине. Для нескольких машин нужен S3/MinIO — это в планах.
