# CBT-I Mobile API

Backend for the Sleep Coach iOS app. Isolated from the web `cbtinsomnia-api`.

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

Email/password and native Apple / Google sign-in are supported. A verified Apple or Google email is treated as proof of ownership, so an existing password account and an OAuth identity with the same email are linked into one user. Registering an email that already has an OAuth-only account does not create a second user — continue with Apple or Google, and an optional password from the register form is attached after that sign-in.

```bash
# Apple: Sign in with Apple audience is the iOS bundle ID
APPLE_CLIENT_IDS=com.cbtinsomnia.mobile

# Google: include every client ID that may appear as the ID token `aud`
# (typically the iOS client ID and the Web client ID)
GOOGLE_CLIENT_IDS=ios-id.apps.googleusercontent.com,web-id.apps.googleusercontent.com
```

## OpenAI

Set `OPENAI_API_KEY` in `.env`. Chat is restricted to sleep / CBT-I topics. Sleep Analysis coaches on last night’s Health + diary data.
