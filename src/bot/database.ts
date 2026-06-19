import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../bot_data.json");

export interface Account {
  id: string;
  userId: string;
  username: string;
  name: string;
  age: number;
  pin: string;
  balance: number;
  cash: number;
  frozen: boolean;
  salary: number;
  createdAt: string;
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
  requestedAt: string;
  channelId: string;
  messageId?: string;
  salary: number;
}

export interface BotDB {
  accounts: Record<string, Account>;
  transactions: Transaction[];
  pending: PendingRequest[];
  settings: {
    salaryChannelId?: string;
    requestChannelId?: string;
    adminRoleId?: string;
    salaryDay: number;
    lastSalaryPaid?: string;
  };
}

function loadDB(): BotDB {
  if (!fs.existsSync(DB_PATH)) {
    const initial: BotDB = {
      accounts: {},
      transactions: [],
      pending: [],
      settings: { salaryDay: 4 },
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as BotDB;
  // ترقية: إضافة الحقول الجديدة للحسابات القديمة
  for (const acc of Object.values(db.accounts)) {
    if ((acc as any).cash === undefined) (acc as any).cash = 0;
    if ((acc as any).name === undefined) (acc as any).name = acc.username;
    if ((acc as any).age === undefined) (acc as any).age = 0;
    if ((acc as any).pin === undefined) (acc as any).pin = "0000";
  }
  return db;
}

function saveDB(db: BotDB): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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
  pin: string = "0000"
): Account {
  const db = loadDB();
  const id = generateAccountNumber();
  const account: Account = {
    id,
    userId,
    username,
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
