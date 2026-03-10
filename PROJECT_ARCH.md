# PROJECT_ARCH.md — OnShift: Architektonická dokumentácia

> Interný referenčný dokument pre AI spolupracovníkov. Aktualizovaný: 2026-03-07.

---

## 1. Technologický stack

| Vrstva | Technológia |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Jazyk | TypeScript 5 |
| Databáza | PostgreSQL (Hetzner via Coolify) |
| ORM | Drizzle ORM 0.45 |
| Auth | Better Auth 1.4 (email/password, session-based) |
| UI komponenty | shadcn/ui (Radix UI primitives) |
| Styling | Tailwind CSS v4 |
| Ikony | Lucide React |
| Grafy | Recharts |
| Notifikácie | Sonner (toast) |
| Theme | next-themes (dark/light) |
| DB driver | `postgres` (pg) |

---

## 2. Dátový model (Schema)

Súbor: `db/schema.ts`

### Enumy

```
role:                   superadmin | admin | employee
license_type:           free | basic | pro
shift_status:           requested | draft | open | published
open_shift_claim_status: pending | approved | rejected
leave_type:             vacation | sick | personal
leave_status:           pending | approved | rejected
replacement_status:     pending | accepted | rejected
shift_rule_frequency:   once | weekly | monthly
shift_exception_action: skip | modify
```

### Hlavné tabuľky

#### `organizations`
Firma / prevádzka. Polia: `id`, `name`, `ico`, `dic`, `address`, `licenseType`, `createdAt`.

#### `user` (Better Auth + rozšírenia)
Zamestnanec alebo admin.

| Pole | Typ | Poznámka |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Zobrazované meno |
| `email` | text | Unikátny login |
| `role` | enum | `superadmin` / `admin` / `employee` |
| `organizationId` | uuid | FK → organizations |
| `color` | text | Farba avatara (HEX preset) |
| `hourlyRate` | numeric(10,2) | Hodinová sadzba (pre mzdy) |
| `archivedAt` | timestamp | Null = aktívny zamestnanec |
| `mustChangePassword` | boolean | Po prvom prihlásení |
| `defaultDays` | text | Legacy; comma-separated "1,2,3" |
| `defaultStartTime` / `defaultEndTime` | text | Legacy defaults |

#### `shiftRules` — **jadro systému plánovaných zmien**
Šablóna zmeny. Jedna pravidlo → N virtuálnych inštancií.

| Pole | Typ | Poznámka |
|---|---|---|
| `id` | uuid | PK |
| `organizationId` | uuid | FK |
| `userId` | uuid \| null | null = otvorená zmena (open shift) |
| `frequency` | enum | `once` / `weekly` / `monthly` |
| `date` | date | Pre `once` — konkrétny dátum |
| `days` | text | Pre `weekly` — comma-sep dni (0=Ne…6=So) |
| `dayOfMonth` | text | Pre `monthly` — comma-sep čísla dní (napr. "1,15,-1") |
| `validFrom` / `validUntil` | date | Platnosť opakujúcich sa pravidiel |
| `startTime` / `endTime` | text \| null | Formát "HH:MM"; null ak `allDay=true` |
| `allDay` | boolean | Celodenná zmena → čas z `business_hours` |
| `note` | text | Poznámka |
| `status` | enum | `draft` / `published` |
| `createdAt` | timestamp | |

#### `shiftExceptions`
Výnimky pre jednotlivé inštancie pravidla.

| Pole | Typ | Poznámka |
|---|---|---|
| `id` | uuid | PK |
| `ruleId` | uuid | FK → shiftRules |
| `date` | date | Dátum konkrétnej inštancie |
| `action` | enum | `skip` = vynechai / `modify` = zmeň |
| `userId` | uuid \| null | Prepis zamestnanca |
| `startTime` / `endTime` | text \| null | Prepis času |
| `note` | text | Prepis poznámky |

#### `shifts` (legacy)
Pôvodné ručne vytvorené zmeny. Stále existujú v DB a zobrazujú sa v kalendári, ale nové zmeny sa vytvárajú cez `shiftRules`.

#### `attendance`
Záznamy dochádzky (clock in/out).
Polia: `id`, `userId`, `organizationId`, `clockIn`, `clockOut`, `note`, `approved`.

#### `leaves`
Dovolenky a absencie.
Polia: `id`, `userId`, `organizationId`, `type`, `status`, `startDate`, `endDate`, `note`.

#### `business_hours`
Prevádzkové hodiny podľa dňa týždňa.
Polia: `organizationId`, `dayOfWeek` (0–6), `openTime`, `closeTime`, `isClosed`.

#### `openShiftClaims`
Žiadosti zamestnancov o otvorené zmeny.
Polia: `id`, `shiftId`, `userId`, `status`, `requestedAt`.

#### `shiftReplacements`
Výmeny zmien medzi zamestnancami.
Polia: `id`, `requesterId`, `targetId`, `shiftId`, `status`.

### Vzťahy (zjednodušene)

```
organizations ──< user_organizations >── user
organizations ──< shiftRules >──< shiftExceptions
organizations ──< shifts
organizations ──< attendance
organizations ──< leaves
shiftRules ──< openShiftClaims (cez shifts.open)
```

---

## 3. Kľúčová logika

### 3a. Rozbaľovanie pravidiel → inštancie (`lib/expand-rules.ts`)

Pravidlá sú šablóny. Keď server renderuje kalendár, zavolá `expandRules()` ktorá vráti pole `ShiftInstance[]` — virtuálne zmeny pre dané dátumové okno.

```
expandRules(rules, exceptions, rangeStart, rangeEnd, businessHours) → ShiftInstance[]
```

**Postup:**
1. Pre každé pravidlo vypočítaj všetky dátumy, na ktoré padá (podľa `frequency`).
2. Filtruj podľa `validFrom` / `validUntil` a `rangeStart` / `rangeEnd`.
3. Ak existuje výnimka pre daný dátum:
   - `skip` → inštanciu vynechaj
   - `modify` → prepíš polia (čas, zamestnanec, poznámka)
4. Ak `allDay=true` → dohľadaj čas z `businessHours`.
5. Vráť finálne inštancie.

**Typy frekvencií:**
- `once` — pole `date`, jednorázová zmena
- `weekly` — pole `days` (comma-sep, 0=Ne, 1=Po…6=So), opakuje sa každý týždeň v `validFrom–validUntil`
- `monthly` — pole `dayOfMonth` (comma-sep, `-1` = posledný deň mesiaca)

### 3b. Zobrazenie v kalendári (`components/schedule/admin-month-calendar.tsx`)

Stránka (`app/(dashboard)/admin/schedule/page.tsx`) na serveri:
1. Načíta `shiftRules` + `shiftExceptions` + legacy `shifts` z DB.
2. Zavolá `expandRules()`.
3. Zkombinuje výsledky do štruktúry `AdminCalendarDay[][]` (mriežka týždňov).
4. Odovzdá klientskej komponente.

Klientska komponenta zobrazí:
- Mesačný pohľad (grid) alebo týždenný pohľad
- Zmeny podľa stavu: `draft` = prerušovaný okraj, `published` = plný okraj
- Otvorené zmeny (`userId=null`) s možnosťou schválenia žiadostí
- Akcie: upraviť pravidlo, skip inštanciu, zmazať, publikovať/odpublikovať

### 3c. Celodenné zmeny (`allDay=true`)

Ak je `allDay` nastavené:
- `startTime` a `endTime` sú `null` v DB
- Pri renderovaní sa čas doplní z `business_hours` podľa `dayOfWeek`
- Ak je deň zatvorený (`isClosed=true`), zmena sa nevygeneruje

### 3d. Mzdy (`app/(dashboard)/admin/wages/page.tsx`)

**Skutočné mzdy** — z `attendance` záznamov:
- Čas zaokrúhlený na 15-minútové intervaly
- `mzda = (minúty / 60) * hourlyRate`

**Plánované mzdy** — z publikovaných zmien (legacy `shifts`):
- Rovnaký výpočet, ale zo šablónových časov

Timezone: `Europe/Bratislava`. Mesačné hranice sú posunuté o ±3h pre správne lokálne zaradenie.

---

## 4. Adresárová štruktúra

```
OnShift/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── set-password/page.tsx
│   ├── (dashboard)/                   # Autentifikovaný layout
│   │   ├── layout.tsx                 # Číta session, predáva user do sidebaru
│   │   ├── page.tsx                   # Dashboard overview
│   │   ├── attendance/page.tsx        # Dochádzka (clock in/out)
│   │   ├── schedule/page.tsx          # Zamestnanec: moje zmeny
│   │   ├── leaves/page.tsx            # Žiadosti o dovolenku
│   │   ├── replacements/page.tsx      # Výmeny zmien
│   │   └── admin/
│   │       ├── employees/page.tsx     # Správa zamestnancov
│   │       ├── schedule/page.tsx      # *** Plánovač zmien (hlavná stránka) ***
│   │       ├── wages/page.tsx         # Prehľad miezd
│   │       ├── leaves/page.tsx        # Schvaľovanie dovoleniek
│   │       ├── reports/page.tsx       # Reporty odpracovaných hodín
│   │       ├── replacements/page.tsx  # Správa výmen
│   │       └── settings/page.tsx      # Nastavenia prevádzky
│   ├── (superadmin)/                  # Super-admin sekcia (správa organizácií)
│   ├── api/auth/[...all]/route.ts     # Better Auth handler
│   └── actions/                       # Server Actions
│       ├── attendance.ts
│       ├── employees.ts
│       ├── leaves.ts
│       ├── organizations.ts
│       ├── schedule.ts                # Legacy shift akcie
│       ├── shift-replacements.ts
│       ├── shift-rules.ts             # *** Shift rule CRUD + výnimky ***
│       └── settings.ts
├── components/
│   ├── schedule/
│   │   ├── admin-month-calendar.tsx   # *** Hlavný kalendár (admin) ***
│   │   ├── shift-dialog.tsx           # *** Formulár pre shift rule ***
│   │   ├── employee-schedule-view.tsx # Pohľad zamestnanca
│   │   └── month-calendar.tsx         # Základný mesačný kalendár
│   ├── admin/
│   │   └── staff-tabs.tsx             # Výber zamestnanca (tabs)
│   ├── wages/
│   │   ├── wages-table.tsx
│   │   └── planned-wages-table.tsx
│   ├── employees/
│   │   ├── employees-table.tsx
│   │   └── employee-dialog.tsx
│   ├── attendance/
│   │   ├── clock-card.tsx
│   │   ├── attendance-table.tsx
│   │   └── edit-attendance-dialog.tsx
│   ├── leaves/ …
│   ├── shift-replacement/ …
│   ├── ui/                            # shadcn/ui komponenty
│   ├── app-sidebar.tsx
│   └── user-menu.tsx
├── db/
│   ├── schema.ts                      # *** Všetky Drizzle tabuľky ***
│   ├── index.ts                       # DB singleton (`db` export)
│   └── migrations/                    # Auto-generované migrácie
├── lib/
│   ├── auth.ts                        # Better Auth konfigurácia
│   ├── auth-client.ts                 # Klientske exporty (signIn, signOut…)
│   ├── auth-guard.ts                  # requireAdmin(), getOrganizationId()
│   ├── expand-rules.ts                # *** Rozbaľovanie shift pravidiel ***
│   ├── session.ts                     # Session helper
│   ├── utils.ts                       # cn(), formátovanie
│   └── week.ts                        # Pomocné funkcie pre týždne/dátumy
├── hooks/
│   └── use-mobile.ts
├── scripts/                           # Seed / migrácia skripty (tsx)
├── CLAUDE.md
├── PROJECT_ARCH.md                    # ← tento súbor
├── drizzle.config.ts
├── next.config.ts
└── package.json
```

---

## 5. API / Serverové endpointy

### REST API

| Metóda | Cesta | Popis |
|---|---|---|
| `GET/POST` | `/api/auth/[...all]` | Všetky Better Auth endpointy (login, session, logout…) |

Better Auth interne obsluhuje: `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/session`, `POST /api/auth/change-password`, atď.

### Server Actions (Next.js)

Všetky mutácie prebiehajú cez Server Actions (nie REST). Kľúčové:

#### `app/actions/shift-rules.ts`
| Akcia | Popis |
|---|---|
| `createShiftRule(data)` | Vytvor pravidlo (once / weekly / monthly) |
| `updateShiftRule(id, data)` | Uprav pravidlo |
| `deleteShiftRule(id)` | Zmaž pravidlo + kaskádovo výnimky |
| `skipRuleInstance(ruleId, date)` | Vynechaj konkrétnu inštanciu |
| `modifyRuleInstance(ruleId, date, overrides)` | Uprav konkrétnu inštanciu |
| `removeException(exceptionId)` | Obnov pôvodný stav inštancie |
| `toggleShiftRuleStatus(id, currentStatus)` | Publikuj / vráť do draftu |

#### `app/actions/schedule.ts` (legacy)
| Akcia | Popis |
|---|---|
| `createShift(data)` | Vytvor legacy shift záznam |
| `updateShift(id, data)` | Uprav legacy shift |
| `deleteShift(id)` | Zmaž legacy shift |
| `publishShifts(ids[])` | Hromadné publikovanie |

#### `app/actions/attendance.ts`
| Akcia | Popis |
|---|---|
| `clockIn()` | Príchod |
| `clockOut()` | Odchod |
| `editAttendance(id, data)` | Admin: úprava záznamu |

#### `app/actions/leaves.ts`
| Akcia | Popis |
|---|---|
| `requestLeave(data)` | Zamestnanec: žiadosť |
| `approveLeave(id)` / `rejectLeave(id)` | Admin: schválenie |

---

## 6. Vzory a konvencie

### Autorizácia
```typescript
// Na začiatku každej server action / page:
const session = await requireAdmin()          // hádže ak nie admin
const orgId = await getOrganizationId()       // vráti organizationId z session
```

### Dátumy a časy
- Dátumy: ISO string `"YYYY-MM-DD"` (nie `Date` objekt)
- Časy: string `"HH:MM"` (24h)
- Deň týždňa: `0` = Nedeľa … `6` = Sobota (JS štandard)
- Timezone pre výpočty: `"Europe/Bratislava"`
- Slovenský locale: `toLocaleDateString("sk-SK")`

### Revalidácia po mutácii
```typescript
revalidatePath("/admin/schedule")
revalidatePath("/schedule")
```

### Klientske komponenty
- Optimistické UI cez `useTransition` / `startTransition`
- Formuláre: kontrolované stavy (`useState`)
- `router.refresh()` na obnovenie server komponentov po zmene

### Open Shift (otvorená zmena)
- `userId = null` v `shiftRules` / `shifts`
- V `shift-dialog.tsx` reprezentované hodnotou `"__open__"` vo výbere zamestnanca
- Zamestnanci si môžu prihlásiť cez `openShiftClaims`

---

## 7. Roadmap (plánované funkcie)

### Vysoká priorita
- [ ] **Opakujúce sa zmeny** — schéma a logika `shiftRules` je hotová; treba dokončiť UI pre správu pravidiel v kalendári (edit, preview inštancií, bulk operácie)
- [ ] **Celodenné zmeny** — `allDay=true` v `shiftRules` funguje; treba otestovať edge casy (zatvoreté dni, sviatky)
- [ ] **Mzdy z shift rules** — aktuálna stránka `/admin/wages` počíta len z legacy `shifts`; pridať výpočet z rozbalených `shiftRules`

### Stredná priorita
- [ ] **Sviatky** — tabuľka sviatkov, aby `allDay` pravidlá preskočili sviatočné dni
- [ ] **Notifikácie** — email/push keď admin publikuje zmeny
- [ ] **Export** — mzdy a dochádzka do CSV/PDF

### Nízka priorita
- [ ] **Tmavý/svetlý mód** — aktuálne funkčný, ale niektoré komponenty nemajú správne farby
- [ ] **Mobil** — responsívny layout, ale niektoré tabuľky nie sú optimalizované

---

## 8. Lokálny vývoj

```bash
# Inštalácia
npm install

# Spustenie dev servera (Turbopack)
npm run dev

# DB migrácia (po zmene schema.ts)
npm run db:generate   # vygeneruj SQL migrāciu
npm run db:migrate    # aplikuj na DB

# GUI pre databázu
npm run db:studio

# Build
npm run build
npm run lint
```

Premenné prostredia: skopírovať `.env.example` → `.env.local` (nikdy do repozitára).

---

*Tento dokument je živý — aktualizovať pri každej väčšej architektonickej zmene.*
