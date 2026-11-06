# Abode Assist

AI lead-response and site-visit booking assistant for a residential developer in Ahmedabad (2 projects, 420 homes).

**Live:** https://abode-assist.vercel.app · **Docs:** [Technical design](docs/TDD.md) · [Deployment and demo logins](docs/deployment.md)

- **Buyers** (mostly on phones) ask questions in English, हिंदी or ગુજરાતી. The assistant answers only from the sales head's fact sheet, never quotes a final price or discount, and books a site visit in a real free slot. Reminders go out 1 day and 2 hours before.
- **Sales executives** get one lead list from every source, with duplicate checks, response timers, the chat history, an AI summary on handoff, and site-office check-in.
- **The sales head** edits the fact sheet and visit slots, reviews flagged chats daily, and sees response time, visits, show-up rate and cost per visit by source.

```bash
pnpm install && cp .env.example .env.local   # fill in values
pnpm db:migrate && pnpm db:seed && pnpm dev
pnpm test                                     # 146 tests, including DB race tests for double booking
```

Stack: Next.js 16 (App Router) · PostgreSQL on Supabase · AI SDK 7 with a 5-step provider chain (Claude Sonnet → Groq ×2 → Gemini ×2) · Vercel.
