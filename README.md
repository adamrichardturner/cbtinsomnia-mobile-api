# CBT-I Mobile API

Backend for the Sleep Plan iOS app. Isolated from the web `cbtinsomnia-api`.

Grounded in Colin Espie’s CBT-I model (_Overcoming Insomnia_): sleep efficiency, a protected sleep window, stimulus control, and a racing-mind toolkit. It does not reproduce book prose.

## Stack

Express 5, TypeScript, Knex, PostgreSQL, Zod, OpenAI, Jose (JWT). API and database both run in Docker.

## Setup

```bash
cp .env.example .env
# set JWT_SECRET and OPENAI_API_KEY in .env — Compose reads them into the API container
npm run docker:up
```

That starts Postgres and the API. The API waits for the database, runs migrations, then listens on `http://localhost:4001`.

```bash
npm run docker:logs    # follow API logs
npm run docker:ps      # container status
npm run docker:down    # stop both services
```

Host `npm run dev` is optional for local hot-reload against the published Postgres port (`localhost:5433`). Day-to-day use is Docker.

## Auth

Mobile clients use Bearer access tokens and a refresh token. Cookies are not used.

## OpenAI

Set `OPENAI_API_KEY` in `.env`. Chat is restricted to sleep / CBT-I topics. Sleep Analysis coaches on last night’s Health + diary data.
