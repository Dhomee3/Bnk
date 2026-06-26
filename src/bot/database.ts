import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient, Collection } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../bot_data.json");

// ─── MongoDB Setup ─────────────────────────────
const MONGO_URI = process.env.MONGODB_URI ?? "";
const MONGO_DB   = "ftrp";
const MONGO_COL  = "bot_data";

let _mongoCol: Collection | null = null;

async function getCol(): Promise<Collection | null> {
  if (!MONGO_URI) return null;
  if (_mongoCol) return _mongoCol;
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    _mongoCol = client.db(MONGO_DB).collection(MONGO_COL);
    console.log("✅ MongoDB متصل");
    return _mongoCol;
  } catch (e) {
    console.error("❌ خطأ في الاتصال بـ MongoDB:", e);
    return null;
  }
}

// تحميل من MongoDB عند بدء التشغيل إذا كان الملف المحلي فارغاً
export async function initDB(): Promise<void> {
  const col = await getCol();
  if (!col) return;
  try {
    const local = loadDB();
    const hasAccounts = Object.keys(local.accounts).length > 0;
    if (!hasAccounts) {
      const doc = await col.findOne({ _id: "main" as any });
      if (doc?.data) {
        fs.writeFileSync(DB_PATH, JSON.stringify(doc.data, null, 2));
        console.log("✅ تم تحميل البيانات من MongoDB");
      }
    } else {
      // محلي فيه بيانات → رفعها على MongoDB
      await col.updateOne({ _id: "main" as any }, { $set: { data: local } }, { upsert: true });
      console.log("✅ تم مزامنة البيانات المحلية إلى MongoDB");
    }
  } catch (e) {
    console.error("❌ خطأ في initDB:", e);
  }
}

export interface Account {
  id: string;
  userId: string;
  username: string;
  robloxUsername: string;
  name: string;
  age: number;
  pin: string;
  balance: number;
  cash: number;
  frozen: boolean;
  salary: number;
  createdAt: string;
  inventory?: Record<string, number>;
}

export interface WeaponActivation {
  id: string;
  userId: string;
  weaponName: string;
  ownerName: string;
  userOfWeapon: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  logChannelId?: string;
  messageId?: string;
}

export interface Transaction {
  id: string;
  type: "transfer" | "salary" | "freeze" | "unfreeze" | "create";
  fromAccount?: string;
  toAccount?: string;
  amount?: number;
  description: string;
  timestamp: string;
  performedBy: string;
}

export interface PendingRequest {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  name: string;
  age: number;
  pin: string;
  robloxUsername: string;
  requestedAt: string;
  channelId: string;
  messageId?: string;
  salary: number;
}

export interface RobberyLog {
  id: string;
  type: "atm" | "cashier" | "house";
  typeName: string;
  amountPerPerson: number;
  policeAccounts: string[];
  civilianAccounts: string[];
  totalPaid: number;
  timestamp: string;
  performedBy: string;
}

export interface Violation {
  id: string;
  targetUserId: string;
  targetAccountId: string;
  amount: number;
  reason: string;
  status: "unpaid" | "paid" | "evaded" | "cancelled";
  issuedBy: string;
  issuedAt: string;
  expiresAt: string;
  paidAt?: string;
  cancelledBy?: string;
}

export interface BotDB {
  accounts: Record<string, Account>;
  transactions: Transaction[];
  pending: PendingRequest[];
  robberyLogs: RobberyLog[];
  violations?: Violation[];
  weaponStock?: Record<string, number>;
  weaponActivations?: WeaponActivation[];
  settings: {
    salaryChannelId?: string;
    requestChannelId?: string;
    adminRoleId?: string;
    salaryDay: number;
    lastSalaryPaid?: string;
    robberyLogChannelId?: string;
    createLogChannelId?: string;
    deleteLogChannelId?: string;
    weaponActivationLogChannelId?: string;
  };
}

function loadDB(): BotDB {
  if (!fs.existsSync(DB_PATH)) {
    const initial: BotDB = {
      accounts: {},
      transactions: [],
      pending: [],
      robberyLogs: [],
      settings: { salaryDay: 4 },
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as BotDB;
  if (!db.robberyLogs) db.robberyLogs = [];
  if (!db.weaponStock) db.weaponStock = {};
  if (!db.weaponActivations) db.weaponActivations = [];
  if (!db.violations) db.violations = [];
  for (const acc of Object.values(db.accounts)) {
    if ((acc as any).cash === undefined) (acc as any).cash = 0;
    if ((acc as any).name === undefined) (acc as any).name = acc.username;
    if ((acc as any).age === undefined) (acc as any).age = 0;
    if ((acc as any).pin === undefined) (acc as any).pin = "0000";
    if ((acc as any).robloxUsername === undefined) (acc as any).robloxUsername = "";
    if (!acc.inventory) acc.inventory = {};
  }
  return db;
}

export function saveDB(db: BotDB): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  // حفظ async على MongoDB بدون انتظار
  getCol().then((col) => {
    if (!col) return;
    col.updateOne({ _id: "main" as any }, { $set: { data: db } }, { upsert: true }).catch((e) =>
      console.error("❌ خطأ في حفظ MongoDB:", e)
    );
  });
}

export function getDB(): BotDB {
  return loadDB();
}

export function generateAccountNumber(): string {
  const db = loadDB();
  const existing = Object.values(db.accounts).map((a) => parseInt(a.id));
  let num = 1001;
  while (existing.includes(num)) num++;
  return num.toString();
}

export function createAccount(
  userId: string,
  username: string,
  displayName: string,
  salary: number = 0,
  name: string = "",
  age: number = 0,
  pin: string = "0000",
  robloxUsername: string = ""
): Account {
  const db = loadDB();
  const id = generateAccountNumber();
  const account: Account = {
    id,
    userId,
    username,
    robloxUsername,
    name: name || displayName,
    age,
    pin,
    balance: 0,
    cash: 0,
    frozen: false,
    salary,
    createdAt: new Date().toISOString(),
  };
  db.accounts[id] = account;
  db.transactions.push({
    id: Date.now().toString(),
    type: "create",
    toAccount: id,
    description: `تم إنشاء حساب لـ ${displayName}`,
    timestamp: new Date().toISOString(),
    performedBy: userId,
  });
  saveDB(db);
  return account;
}

export function getAccountByUserId(userId: string): Account | null {
  const db = loadDB();
  return Object.values(db.accounts).find((a) => a.userId === userId) || null;
}

export function getAccountById(accountId: string): Account | null {
  const db = loadDB();
  return db.accounts[accountId] || null;
}

export function transfer(
  fromId: string,
  toId: string,
  amount: number,
  performedBy: string
): { success: boolean; error?: string } {
  const db = loadDB();
  const from = db.accounts[fromId];
  const to = db.accounts[toId];
  if (!from) return { success: false, error: "حساب المُرسِل غير موجود" };
  if (!to) return { success: false, error: "حساب المُستقبِل غير موجود" };
  if (from.frozen) return { success: false, error: "حساب المُرسِل مجمّد" };
  if (to.frozen) return { success: false, error: "حساب المُستقبِل مجمّد" };
  if (from.balance < amount) return { success: false, error: "الرصيد غير كافٍ" };
  from.balance -= amount;
  to.balance += amount;
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    fromAccount: fromId,
    toAccount: toId,
    amount,
    description: `تحويل ${amount} من حساب ${fromId} إلى حساب ${toId}`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { success: true };
}

export function freezeAccount(
  accountId: string,
  freeze: boolean,
  performedBy: string
): boolean {
  const db = loadDB();
  if (!db.accounts[accountId]) return false;
  db.accounts[accountId].frozen = freeze;
  db.transactions.push({
    id: Date.now().toString(),
    type: freeze ? "freeze" : "unfreeze",
    toAccount: accountId,
    description: freeze ? `تم تجميد الحساب ${accountId}` : `تم رفع التجميد عن الحساب ${accountId}`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return true;
}

export function paySalaries(performedBy: string): { paid: number; count: number } {
  const db = loadDB();
  let paid = 0;
  let count = 0;
  for (const account of Object.values(db.accounts)) {
    if (!account.frozen && account.salary > 0) {
      account.balance += account.salary;
      paid += account.salary;
      count++;
    }
  }
  db.transactions.push({
    id: Date.now().toString(),
    type: "salary",
    amount: paid,
    description: `صرف رواتب: ${count} موظف - إجمالي ${paid}`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  db.settings.lastSalaryPaid = new Date().toISOString();
  saveDB(db);
  return { paid, count };
}

export function getTransactions(accountId?: string, limit = 10): Transaction[] {
  const db = loadDB();
  let txs = db.transactions;
  if (accountId) {
    txs = txs.filter((t) => t.fromAccount === accountId || t.toAccount === accountId);
  }
  return txs.slice(-limit).reverse();
}

export function addPendingRequest(req: PendingRequest): void {
  const db = loadDB();
  db.pending.push(req);
  saveDB(db);
}

export function removePendingRequest(id: string): PendingRequest | null {
  const db = loadDB();
  const idx = db.pending.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [removed] = db.pending.splice(idx, 1);
  saveDB(db);
  return removed;
}

export function updateSettings(updates: Partial<BotDB["settings"]>): void {
  const db = loadDB();
  db.settings = { ...db.settings, ...updates };
  saveDB(db);
}

export function getAllAccounts(): Account[] {
  const db = loadDB();
  return Object.values(db.accounts);
}

export function setAccountBalance(
  accountId: string,
  amount: number,
  performedBy: string,
  target: "bank" | "cash" = "bank"
): boolean {
  const db = loadDB();
  if (!db.accounts[accountId]) return false;
  const label = target === "cash" ? "كاش" : "بنك";
  if (target === "cash") {
    db.accounts[accountId].cash = (db.accounts[accountId].cash ?? 0) + amount;
  } else {
    db.accounts[accountId].balance += amount;
  }
  db.transactions.push({
    id: Date.now().toString(),
    type: "salary",
    toAccount: accountId,
    amount,
    description: `إضافة ${amount.toLocaleString()} يدوياً (${label}) إلى حساب ${accountId}`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return true;
}

export function removeBalance(
  accountId: string,
  amount: number,
  performedBy: string,
  target: "bank" | "cash" = "bank"
): { success: boolean; error?: string } {
  const db = loadDB();
  const account = db.accounts[accountId];
  if (!account) return { success: false, error: "الحساب غير موجود" };
  const label = target === "cash" ? "كاش" : "بنك";
  const current = target === "cash" ? (account.cash ?? 0) : account.balance;
  if (current < amount) return { success: false, error: `الرصيد الحالي (${current.toLocaleString()}) أقل من المبلغ المطلوب سحبه` };
  if (target === "cash") {
    account.cash = (account.cash ?? 0) - amount;
  } else {
    account.balance -= amount;
  }
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    fromAccount: accountId,
    amount,
    description: `خصم ${amount.toLocaleString()} يدوياً (${label}) من حساب ${accountId}`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { success: true };
}

export function deposit(
  accountId: string,
  amount: number,
  performedBy: string
): { success: boolean; error?: string } {
  const db = loadDB();
  const account = db.accounts[accountId];
  if (!account) return { success: false, error: "الحساب غير موجود" };
  if (account.frozen) return { success: false, error: "الحساب مجمّد" };
  const cash = account.cash ?? 0;
  if (cash < amount) return { success: false, error: `الكاش الحالي (${cash.toLocaleString()}) أقل من المبلغ` };
  account.cash = cash - amount;
  account.balance += amount;
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    toAccount: accountId,
    amount,
    description: `إيداع ${amount.toLocaleString()} من الكاش إلى البنك`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { success: true };
}

export function withdraw(
  accountId: string,
  amount: number,
  performedBy: string
): { success: boolean; error?: string } {
  const db = loadDB();
  const account = db.accounts[accountId];
  if (!account) return { success: false, error: "الحساب غير موجود" };
  if (account.frozen) return { success: false, error: "الحساب مجمّد" };
  if (account.balance < amount) return { success: false, error: `رصيد البنك (${account.balance.toLocaleString()}) غير كافٍ` };
  account.balance -= amount;
  account.cash = (account.cash ?? 0) + amount;
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    fromAccount: accountId,
    amount,
    description: `سحب ${amount.toLocaleString()} من البنك إلى الكاش`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { success: true };
}

export function changeAccountId(
  oldId: string,
  newId: string,
  performedBy: string
): { success: boolean; error?: string } {
  const db = loadDB();
  if (!db.accounts[oldId]) return { success: false, error: "الحساب غير موجود" };
  if (db.accounts[newId]) return { success: false, error: "هذا الرقم مستخدم بالفعل" };
  if (!/^\d{4}$/.test(newId)) return { success: false, error: "يجب أن يكون الإيبان 4 أرقام" };
  const account = { ...db.accounts[oldId], id: newId };
  db.accounts[newId] = account;
  delete db.accounts[oldId];
  for (const tx of db.transactions) {
    if (tx.fromAccount === oldId) tx.fromAccount = newId;
    if (tx.toAccount === oldId) tx.toAccount = newId;
  }
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    toAccount: newId,
    description: `تغيير الإيبان من ${oldId} إلى ${newId}`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { success: true };
}

export function bulkAddBalance(
  value: number,
  mode: "amount" | "percent",
  target: "bank" | "cash",
  performedBy: string
): { count: number; total: number } {
  const db = loadDB();
  let count = 0;
  let total = 0;
  for (const account of Object.values(db.accounts)) {
    if (account.frozen) continue;
    const base = target === "cash" ? (account.cash ?? 0) : account.balance;
    const added = mode === "percent" ? Math.floor(base * value / 100) : value;
    if (target === "cash") account.cash = (account.cash ?? 0) + added;
    else account.balance += added;
    total += added;
    count++;
  }
  const label = mode === "percent" ? `${value}%` : `${value.toLocaleString()} ريال`;
  const tgt = target === "cash" ? "كاش" : "بنك";
  db.transactions.push({
    id: Date.now().toString(),
    type: "salary",
    amount: total,
    description: `إضافة جماعية (${label}) على ${tgt} — ${count} حساب`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { count, total };
}

export function bulkRemoveBalance(
  value: number,
  mode: "amount" | "percent",
  target: "bank" | "cash",
  performedBy: string
): { count: number; total: number } {
  const db = loadDB();
  let count = 0;
  let total = 0;
  for (const account of Object.values(db.accounts)) {
    if (account.frozen) continue;
    const base = target === "cash" ? (account.cash ?? 0) : account.balance;
    const deducted = mode === "percent"
      ? Math.floor(base * value / 100)
      : Math.min(value, base);
    if (target === "cash") account.cash = Math.max(0, (account.cash ?? 0) - deducted);
    else account.balance = Math.max(0, account.balance - deducted);
    total += deducted;
    count++;
  }
  const label = mode === "percent" ? `${value}%` : `${value.toLocaleString()} ريال`;
  const tgt = target === "cash" ? "كاش" : "بنك";
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    amount: total,
    description: `خصم جماعي (${label}) من ${tgt} — ${count} حساب`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { count, total };
}

export function logRobbery(
  log: Omit<RobberyLog, "id">,
  payouts: { accountId: string; amount: number; role: "police" | "civilian" }[]
): { success: boolean; results: { accountId: string; paid: boolean; error?: string }[] } {
  const db = loadDB();
  const results: { accountId: string; paid: boolean; error?: string }[] = [];

  for (const payout of payouts) {
    const account = db.accounts[payout.accountId];
    if (!account) {
      results.push({ accountId: payout.accountId, paid: false, error: "الحساب غير موجود" });
      continue;
    }
    if (account.frozen) {
      results.push({ accountId: payout.accountId, paid: false, error: "الحساب مجمّد" });
      continue;
    }
    account.cash = (account.cash ?? 0) + payout.amount;
    db.transactions.push({
      id: `${Date.now()}-${payout.accountId}`,
      type: "salary",
      toAccount: payout.accountId,
      amount: payout.amount,
      description: `غنيمة سرقة (${log.typeName}): ${payout.amount.toLocaleString()} ريال كاش — ${payout.role === "police" ? "شرطة" : "مواطن"}`,
      timestamp: new Date().toISOString(),
      performedBy: log.performedBy,
    });
    results.push({ accountId: payout.accountId, paid: true });
  }

  const totalPaid = payouts
    .filter((_, i) => results[i]?.paid)
    .reduce((s, p) => s + p.amount, 0);

  const entry: RobberyLog = {
    ...log,
    id: Date.now().toString(),
    totalPaid,
  };
  db.robberyLogs.push(entry);
  saveDB(db);
  return { success: true, results };
}

export function getRobberyLogs(limit = 10): RobberyLog[] {
  const db = loadDB();
  return db.robberyLogs.slice(-limit).reverse();
}

export function deleteAccount(
  accountId: string,
  performedBy: string
): { success: boolean; error?: string } {
  const db = loadDB();
  if (!db.accounts[accountId]) return { success: false, error: "الحساب غير موجود" };
  const account = db.accounts[accountId];
  delete db.accounts[accountId];
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    fromAccount: accountId,
    description: `حذف حساب ${accountId} (${account.name}) بواسطة الإدارة`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { success: true };
}

// ─── Weapons / Resources ─────────────────────

export function setWeaponStock(key: string, qty: number): void {
  const db = loadDB();
  if (!db.weaponStock) db.weaponStock = {};
  db.weaponStock[key] = Math.max(0, qty);
  saveDB(db);
}

export function adjustWeaponStock(key: string, delta: number): void {
  const db = loadDB();
  if (!db.weaponStock) db.weaponStock = {};
  db.weaponStock[key] = Math.max(0, (db.weaponStock[key] ?? 0) + delta);
  saveDB(db);
}

export function addResources(
  accountId: string,
  key: string,
  qty: number,
): { success: boolean; error?: string } {
  const db = loadDB();
  const acc = db.accounts[accountId];
  if (!acc) return { success: false, error: "الحساب غير موجود" };
  if (!acc.inventory) acc.inventory = {};
  acc.inventory[key] = (acc.inventory[key] ?? 0) + qty;
  saveDB(db);
  return { success: true };
}

export function removeResources(
  accountId: string,
  key: string,
  qty: number,
): { success: boolean; error?: string } {
  const db = loadDB();
  const acc = db.accounts[accountId];
  if (!acc) return { success: false, error: "الحساب غير موجود" };
  if (!acc.inventory) acc.inventory = {};
  const cur = acc.inventory[key] ?? 0;
  if (cur < qty) return { success: false, error: `الكمية غير كافية (يملك: ${cur})` };
  acc.inventory[key] = cur - qty;
  saveDB(db);
  return { success: true };
}

export function transferResources(
  fromId: string,
  toId: string,
  key: string,
  qty: number,
): { success: boolean; error?: string } {
  const db = loadDB();
  const from = db.accounts[fromId];
  const to   = db.accounts[toId];
  if (!from) return { success: false, error: "حسابك غير موجود" };
  if (!to)   return { success: false, error: "حساب المستلم غير موجود" };
  if (!from.inventory) from.inventory = {};
  if (!to.inventory)   to.inventory = {};
  const cur = from.inventory[key] ?? 0;
  if (cur < qty) return { success: false, error: `لا تملك كمية كافية (تملك: ${cur})` };
  from.inventory[key] = cur - qty;
  to.inventory[key]   = (to.inventory[key] ?? 0) + qty;
  saveDB(db);
  return { success: true };
}

export function buyResource(
  accountId: string,
  key: string,
  qty: number,
  pricePerUnit: number,
): { success: boolean; error?: string } {
  const db  = loadDB();
  const acc = db.accounts[accountId];
  if (!acc)          return { success: false, error: "الحساب غير موجود" };
  if (acc.frozen)    return { success: false, error: "الحساب مجمّد" };
  const total = qty * pricePerUnit;
  if (acc.balance < total)
    return { success: false, error: `الرصيد غير كافٍ (${acc.balance.toLocaleString()} < ${total.toLocaleString()})` };
  if (!db.weaponStock) db.weaponStock = {};
  const stock = db.weaponStock[key] ?? 0;
  if (stock < qty)
    return { success: false, error: `الكمية غير متوفرة في المخزن (متوفر: ${stock})` };
  acc.balance -= total;
  if (!acc.inventory) acc.inventory = {};
  acc.inventory[key] = (acc.inventory[key] ?? 0) + qty;
  db.weaponStock[key] = stock - qty;
  db.transactions.push({
    id: Date.now().toString(),
    type: "transfer",
    fromAccount: accountId,
    amount: total,
    description: `شراء ${qty} × ${key} بـ ${total.toLocaleString()} ريال`,
    timestamp: new Date().toISOString(),
    performedBy: accountId,
  });
  saveDB(db);
  return { success: true };
}

export function addWeaponActivation(act: WeaponActivation): void {
  const db = loadDB();
  if (!db.weaponActivations) db.weaponActivations = [];
  db.weaponActivations.push(act);
  saveDB(db);
}

export function updateWeaponActivation(
  id: string,
  updates: Partial<WeaponActivation>,
): void {
  const db = loadDB();
  if (!db.weaponActivations) return;
  const idx = db.weaponActivations.findIndex((a) => a.id === id);
  if (idx === -1) return;
  db.weaponActivations[idx] = { ...db.weaponActivations[idx], ...updates };
  saveDB(db);
}

export function getWeaponActivation(id: string): WeaponActivation | null {
  const db = loadDB();
  return db.weaponActivations?.find((a) => a.id === id) ?? null;
}

export function payRoleSalaries(
  salaries: { userId: string; amount: number; roleName: string }[],
  performedBy: string
): { paid: number; count: number } {
  const db = loadDB();
  let paid = 0;
  let count = 0;
  for (const { userId, amount, roleName } of salaries) {
    const account = Object.values(db.accounts).find((a) => a.userId === userId);
    if (!account || account.frozen) continue;
    account.balance += amount;
    paid += amount;
    count++;
    db.transactions.push({
      id: `${Date.now()}-${userId}`,
      type: "salary",
      toAccount: account.id,
      amount,
      description: `راتب ${roleName}: ${amount.toLocaleString()} ريال`,
      timestamp: new Date().toISOString(),
      performedBy,
    });
  }
  db.settings.lastSalaryPaid = new Date().toISOString();
  saveDB(db);
  return { paid, count };
}

// ─── Format IBAN ───────────────────────────────
export function formatIBAN(id: string): string {
  const num = id.toString().padStart(6, "0");
  return `SA${num.slice(0, 2)}-${num.slice(2, 4)}-${num.slice(4)}`;
}

// ─── Violations ────────────────────────────────
export function issueViolation(
  targetUserId: string,
  targetAccountId: string,
  amount: number,
  reason: string,
  issuedBy: string,
): Violation {
  const db = loadDB();
  const id = `VIO-${Date.now()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const v: Violation = {
    id,
    targetUserId,
    targetAccountId,
    amount,
    reason,
    status: "unpaid",
    issuedBy,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  if (!db.violations) db.violations = [];
  db.violations.push(v);
  saveDB(db);
  return v;
}

export function getViolationsByUserId(userId: string): Violation[] {
  const db = loadDB();
  return (db.violations ?? []).filter((v) => v.targetUserId === userId);
}

export function getUnpaidViolationsByUserId(userId: string): Violation[] {
  return getViolationsByUserId(userId).filter((v) => v.status === "unpaid");
}

export function getAllViolations(limit = 25): Violation[] {
  const db = loadDB();
  const all = db.violations ?? [];
  return all.slice(-limit).reverse();
}

export function payViolation(
  violationId: string,
  performedBy: string,
): { success: boolean; error?: string } {
  const db = loadDB();
  if (!db.violations) db.violations = [];
  const v = db.violations.find((x) => x.id === violationId);
  if (!v) return { success: false, error: "المخالفة غير موجودة" };
  if (v.status !== "unpaid") return { success: false, error: "المخالفة مسددة أو منتهية بالفعل" };
  const account = Object.values(db.accounts).find((a) => a.userId === v.targetUserId);
  if (!account) return { success: false, error: "لا يوجد حساب للمستخدم" };
  if (account.balance < v.amount) return { success: false, error: "الرصيد غير كافٍ" };
  account.balance -= v.amount;
  v.status = "paid";
  v.paidAt = new Date().toISOString();
  db.transactions.push({
    id: `${Date.now()}-vio-pay`,
    type: "withdraw",
    fromAccount: account.id,
    amount: v.amount,
    description: `تسديد مخالفة ${violationId}: ${v.reason}`,
    timestamp: new Date().toISOString(),
    performedBy,
  });
  saveDB(db);
  return { success: true };
}

export function payAllViolations(
  userId: string,
  performedBy: string,
): { paid: number; count: number; error?: string } {
  const db = loadDB();
  if (!db.violations) db.violations = [];
  const account = Object.values(db.accounts).find((a) => a.userId === userId);
  if (!account) return { paid: 0, count: 0, error: "لا يوجد حساب" };
  const unpaid = db.violations.filter((v) => v.targetUserId === userId && v.status === "unpaid");
  const total = unpaid.reduce((s, v) => s + v.amount, 0);
  if (account.balance < total) return { paid: 0, count: 0, error: "الرصيد غير كافٍ لتسديد كل المخالفات" };
  account.balance -= total;
  const now = new Date().toISOString();
  for (const v of unpaid) {
    v.status = "paid";
    v.paidAt = now;
    db.transactions.push({
      id: `${Date.now()}-${v.id}`,
      type: "withdraw",
      fromAccount: account.id,
      amount: v.amount,
      description: `تسديد مخالفة ${v.id}: ${v.reason}`,
      timestamp: now,
      performedBy,
    });
  }
  saveDB(db);
  return { paid: total, count: unpaid.length };
}

export function cancelViolation(
  violationId: string,
  cancelledBy: string,
): { success: boolean; error?: string } {
  const db = loadDB();
  if (!db.violations) db.violations = [];
  const v = db.violations.find((x) => x.id === violationId);
  if (!v) return { success: false, error: "المخالفة غير موجودة" };
  if (v.status === "cancelled") return { success: false, error: "المخالفة ملغاة بالفعل" };
  v.status = "cancelled";
  v.cancelledBy = cancelledBy;
  saveDB(db);
  return { success: true };
}

export function markExpiredViolations(): number {
  const db = loadDB();
  if (!db.violations) return 0;
  const now = new Date();
  let count = 0;
  for (const v of db.violations) {
    if (v.status === "unpaid" && new Date(v.expiresAt) < now) {
      v.status = "evaded";
      count++;
    }
  }
  if (count > 0) saveDB(db);
  return count;
}
