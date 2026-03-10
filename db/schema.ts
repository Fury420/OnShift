import { pgTable, text, timestamp, pgEnum, date, time, uuid, boolean, decimal, unique, integer, index } from "drizzle-orm/pg-core"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["superadmin", "admin", "manager", "employee"])
export const licenseTypeEnum = pgEnum("license_type", ["free", "basic", "pro"])
export const shiftStatusEnum = pgEnum("shift_status", ["requested", "draft", "open", "published"])
export const openShiftClaimStatusEnum = pgEnum("open_shift_claim_status", ["pending", "approved", "rejected"])
export const leaveTypeEnum = pgEnum("leave_type", ["vacation", "sick", "personal"])
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected"])
export const replacementStatusEnum = pgEnum("replacement_status", ["pending", "accepted", "rejected"])
export const shiftRuleFrequencyEnum = pgEnum("shift_rule_frequency", ["once", "weekly", "monthly"])
export const shiftExceptionActionEnum = pgEnum("shift_exception_action", ["skip", "modify"])
export const notificationTypeEnum = pgEnum("notification_type", [
  "leave_requested", "leave_approved", "leave_rejected", "leave_cancelled",
  "shift_assigned", "shift_modified", "open_shift_published", "drafts_published",
  "attendance_edited",
  "replacement_requested", "replacement_accepted", "replacement_rejected", "replacement_resolved",
])

// ─── Organizations ────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ico: text("ico"),
  dic: text("dic"),
  icDph: text("ic_dph"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  licenseType: licenseTypeEnum("license_type").notNull().default("free"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// ─── Business hours (otváracie hodiny podniku) ────────────────────────────────
// dayOfWeek: 0 = Ne, 1 = Po, …, 6 = So (konzistentné s defaultDays na user)
export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week").notNull(), // "0".."6"
    openTime: time("open_time"),
    closeTime: time("close_time"),
    isClosed: boolean("is_closed").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.organizationId, t.dayOfWeek)],
)

// ─── User ↔ Organization membership ──────────────────────────────────────────

export const userOrganizations = pgTable(
  "user_organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.organizationId)],
)

// ─── Better Auth tables ───────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  role: roleEnum("role").notNull().default("employee"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  color: text("color"), // hex color e.g. "#3b82f6"
  archivedAt: timestamp("archived_at"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  positionId: uuid("position_id").references(() => positions.id, { onDelete: "set null" }),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }),
  defaultDays: text("default_days"), // comma-separated day numbers: 0=Sun,1=Mon,...,6=Sat
  defaultStartTime: time("default_start_time"),
  defaultEndTime: time("default_end_time"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
})

// ─── Positions (pracovné pozície) ─────────────────────────────────────────────

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.organizationId, t.name)],
)

// ─── App tables ───────────────────────────────────────────────────────────────

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" }),
  positionId: uuid("position_id").references(() => positions.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  maxClaims: integer("max_claims").notNull().default(1),
  note: text("note"),
  status: shiftStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const attendance = pgTable("attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "set null" }),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  note: text("note"),
  editedAt: timestamp("edited_at"),
  editedBy: text("edited_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const leaves = pgTable("leaves", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: leaveTypeEnum("type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: leaveStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  /** Navrhnutý zastup – môže schváliť žiadosť aj tento používateľ (okrem admina). */
  suggestedReplacementUserId: text("suggested_replacement_user_id").references(() => user.id, { onDelete: "set null" }),
  approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const openShiftClaims = pgTable("open_shift_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  claimedByUserId: text("claimed_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: openShiftClaimStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const shiftReplacements = pgTable("shift_replacements", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  shiftId: uuid("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  requestedByUserId: text("requested_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  replacementUserId: text("replacement_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: replacementStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// ─── Shift rules (pravidlá zmien — jednorazové aj opakujúce sa) ──────────────

export const shiftRules = pgTable("shift_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" }),
  positionId: uuid("position_id").references(() => positions.id, { onDelete: "set null" }),

  frequency: shiftRuleFrequencyEnum("frequency").notNull(), // once | weekly | monthly

  // "once" — single date
  date: date("date"),

  // "weekly" / "monthly" — recurrence config
  days: text("days"),             // comma-separated day numbers: 0=Sun,1=Mon,...,6=Sat
  dayOfMonth: text("day_of_month"), // for monthly: comma-separated day-of-month numbers (1-31)
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),

  // Time (nullable when allDay = true → uses business hours)
  startTime: time("start_time"),
  endTime: time("end_time"),
  allDay: boolean("all_day").notNull().default(false),

  maxClaims: integer("max_claims").notNull().default(1),
  note: text("note"),
  status: shiftStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

// ─── Shift exceptions (výnimky z pravidiel — preskočenie alebo úprava inštancie) ─

export const shiftExceptions = pgTable("shift_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruleId: uuid("rule_id")
    .notNull()
    .references(() => shiftRules.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  action: shiftExceptionActionEnum("action").notNull(), // skip | modify

  // Override fields for "modify"
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  startTime: time("start_time"),
  endTime: time("end_time"),
  note: text("note"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// ─── Notifications ───────────────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    referenceId: text("reference_id"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_notif_recipient_unread").on(t.recipientId, t.isRead, t.createdAt)],
)
