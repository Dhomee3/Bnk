import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
  type TextChannel,
  type GuildMember,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import cron from "node-cron";
import {
  getDB,
  createAccount,
  getAccountByUserId,
  getAccountById,
  transfer,
  deposit,
  withdraw,
  changeAccountId,
  bulkAddBalance,
  bulkRemoveBalance,
  freezeAccount,
  getTransactions,
  addPendingRequest,
  removePendingRequest,
  updateSettings,
  getAllAccounts,
  setAccountBalance,
  removeBalance,
  payRoleSalaries,
  logRobbery,
  getRobberyLogs,
  deleteAccount,
  setWeaponStock,
  addResources,
  removeResources,
  transferResources,
  buyResource,
  addWeaponActivation,
  updateWeaponActivation,
  getWeaponActivation,
} from "./database.js";

// ─── جدول الرواتب بالرتب ─────────────────────
const ROLE_SALARIES: Record<string, { amount: number; name: string }> = {
  // وزارة الداخلية
  "1346802020316610582": { amount: 1500, name: "داخلية - رتبة 1" },
  "1388219474544562316": { amount: 1700, name: "داخلية - رتبة 2" },
  "1346802551168696320": { amount: 2000, name: "داخلية - رتبة 3" },
  "1346802626188017695": { amount: 2500, name: "داخلية - رتبة 4" },
  "1346802701849202710": { amount: 3000, name: "داخلية - رتبة 5" },
  "1346802795751280640": { amount: 3500, name: "داخلية - رتبة 6" },
  "1346802916354428928": { amount: 4500, name: "داخلية - رتبة 7" },
  "1346803009090486383": { amount: 6000, name: "داخلية - رتبة 8" },
  "1346803109417975818": { amount: 7000, name: "داخلية - رتبة 9" },
  "1346804981629456424": { amount: 9000, name: "داخلية - رتبة 10" },
  "1346805141226918002": { amount: 12000, name: "داخلية - رتبة 11" },
  "1346805364083003392": { amount: 15000, name: "داخلية - رتبة 12" },
  "1346805455887929377": { amount: 18000, name: "داخلية - رتبة 13" },
  "1346805531842711614": { amount: 21000, name: "داخلية - رتبة 14" },
  "1346805633084821504": { amount: 25000, name: "داخلية - رتبة 15" },
  "1346805810914660446": { amount: 30000, name: "داخلية - رتبة 16" },
  "1346805718237581332": { amount: 35000, name: "داخلية - رتبة 17" },
  // وزارة العدل
  "1346798288195813436": { amount: 6000, name: "عدل - رتبة 1" },
  "1346798396567982110": { amount: 9000, name: "عدل - رتبة 2" },
  "1346798525710598206": { amount: 20000, name: "عدل - رتبة 3" },
  "1346798520908124263": { amount: 30000, name: "عدل - رتبة 4" },
  // وزارة الصحة
  "1346796797292707891": { amount: 5000, name: "صحة - رتبة 1" },
  "1346796984207671367": { amount: 5000, name: "صحة - رتبة 2" },
  "1346796984337436674": { amount: 5000, name: "صحة - رتبة 3" },
  "1346797332410404914": { amount: 15000, name: "صحة - رتبة 4" },
  "1346797328337731595": { amount: 20000, name: "صحة - رتبة 5" },
  // الصحافة
  "1346794635632054305": { amount: 6000, name: "صحافة" },
  // الهيئة العامة للنقل
  "1346794954999205908": { amount: 4000, name: "هيئة النقل" },
  // أجرة / تاكسي
  "1346794198577315902": { amount: 4000, name: "أجرة (Taxi)" },
  // مدني
  "1346794021200203776": { amount: 1000, name: "مدني" },
};

// يحسب أعلى راتب للعضو بناءً على رتبه
function getHighestSalaryForMember(
  roleIds: string[],
): { amount: number; name: string } | null {
  let best: { amount: number; name: string } | null = null;
  for (const roleId of roleIds) {
    const salary = ROLE_SALARIES[roleId];
    if (salary && (!best || salary.amount > best.amount)) {
      best = salary;
    }
  }
  return best;
}

const DARK_BLUE = 0x1a237e;
const GREEN = 0x2e7d32;
const RED = 0xb71c1c;
const ORANGE = 0xe65100;
const PURPLE = 0x6a1b9a;

// ─── إعدادات نظام السرقة ──────────────────────
const ROBBERY_CONFIG: Record<string, { name: string; emoji: string; amount: number; policeMin: number; policeMax: number; civilMin: number; civilMax: number; civilLabel: string }> = {
  atm:     { name: "صرافة (ATM)", emoji: "🏧", amount: 3000, policeMin: 2, policeMax: 4, civilMin: 1, civilMax: 4, civilLabel: "المواطنين" },
  cashier: { name: "كاشير",       emoji: "🏪", amount: 2000, policeMin: 2, policeMax: 6, civilMin: 1, civilMax: 5, civilLabel: "المواطنين" },
  house:   { name: "منزل",        emoji: "🏠", amount: 5000, policeMin: 4, policeMax: 6, civilMin: 2, civilMax: 6, civilLabel: "المجرمين" },
};
type RobberyType = "atm" | "cashier" | "house";

// ─── موارد الأسلحة ────────────────────────────
const WEAPON_ITEMS: Record<string, { emoji: string; name: string; price: number; desc: string; blackMarket?: boolean }> = {
  baroud:   { emoji: "🧪", name: "بارود",        price: 4,    desc: "يـسـتـخـدم لإطـلاق الـذخـيـرة" },
  masoura:  { emoji: "⚙️", name: "ماسورة",       price: 4,    desc: "الـجـزء الـدقـيـق الـمـسـؤول عـن خـروج الـطـلـقـات" },
  folath:   { emoji: "🔩", name: "فولاذ",         price: 20,   desc: "تـقـويـة اجـزاء الـسـلاح" },
  zinnad:   { emoji: "🔘", name: "زناد",          price: 30,   desc: "ألـيـة إطـلاق الـنـار" },
  hadid:    { emoji: "🪨", name: "حديد خام",     price: 40,   desc: "الـمـادة الأسـاسـيـة للـتـصـنـيـع" },
  mukhatat: { emoji: "📐", name: "مخطط تصنيع",   price: 700,  desc: "طـريـقـة تـركـيـب الـسـلاح ونـمـوذجـه" },
  haykal:   { emoji: "🧩", name: "هيكل سلاح",    price: 1000, desc: "الـمـكـون الأسـاسـي الـي تـركـب عـلـيـه الـقـطـع" },
  bakhakh:  { emoji: "💈", name: "بخاخ عصابات",  price: 9000, desc: "مـخـصص لـتـحـديـد واحـتـلال الـمـنـاطـق — اسـتـعـمـال مـرة واحـدة فـقـط", blackMarket: true },
};

// ─── قائمة الأسلحة القابلة للتصنيع ──────────
interface CraftableWeapon { name: string; damage: number; ammo: number; type: string; weight: string; cost: number; recipe: Record<string, number> }
const CRAFTABLE_WEAPONS: Record<string, CraftableWeapon> = {
  remington_msr: { name: "Remington MSR",  damage: 75,   ammo: 6,   type: "SEMI", weight: "ثقيل",         cost: 38096, recipe: { hadid: 270, folath: 900, baroud: 12, mukhatat: 3, masoura: 12, zinnad: 7,  haykal: 5 } },
  m249:          { name: "M249",            damage: 9,    ammo: 200, type: "AUTO", weight: "ثقيل جداً",     cost: 17694, recipe: { hadid: 300, folath: 500, baroud: 9,  mukhatat: 2, masoura: 12, zinnad: 7,  haykal: 3 } },
  ppsh41:        { name: "PPSH 41",         damage: 10,   ammo: 72,  type: "AUTO", weight: "ثقيل",          cost: 12056, recipe: { hadid: 190, folath: 320, baroud: 6,  mukhatat: 1, masoura: 8,  zinnad: 6,  haykal: 2 } },
  ak47:          { name: "AK47",            damage: 10.5, ammo: 30,  type: "AUTO", weight: "ثقيل",          cost: 14128, recipe: { hadid: 170, folath: 220, baroud: 7,  mukhatat: 1, masoura: 5,  zinnad: 6,  haykal: 2 } },
  m14:           { name: "M14",             damage: 24.3, ammo: 20,  type: "SEMI", weight: "قريب الثقيل",   cost: 9784,  recipe: { hadid: 140, folath: 115, baroud: 7,  mukhatat: 1, masoura: 9,  zinnad: 4,  haykal: 1 } },
  lmt_l129a1:    { name: "LMT L129A1",      damage: 16,   ammo: 20,  type: "SEMI", weight: "قريب الثقيل",   cost: 8886,  recipe: { hadid: 120, folath: 110, baroud: 5,  mukhatat: 1, masoura: 4,  zinnad: 5,  haykal: 1 } },
  skorpion:      { name: "Skorpion",         damage: 11,   ammo: 24,  type: "AUTO", weight: "قريب الثقيل",   cost: 5500,  recipe: { hadid: 65,  folath: 50,  baroud: 4,  mukhatat: 1, masoura: 3,  zinnad: 4,  haykal: 1 } },
  tec9:          { name: "Tec-9",            damage: 9.8,  ammo: 32,  type: "AUTO", weight: "قريب الثقيل",   cost: 5448,  recipe: { hadid: 60,  folath: 60,  baroud: 4,  mukhatat: 1, masoura: 3,  zinnad: 4,  haykal: 1 } },
  kriss_vector:  { name: "Kriss Vector",     damage: 7.3,  ammo: 30,  type: "AUTO", weight: "قريب الثقيل",   cost: 5828,  recipe: { hadid: 70,  folath: 60,  baroud: 2,  mukhatat: 1, masoura: 3,  zinnad: 4,  haykal: 1 } },
  desert_eagle:  { name: "Desert Eagle",     damage: 20,   ammo: 10,  type: "SEMI", weight: "خفيف",          cost: 6056,  recipe: { hadid: 70,  folath: 70,  baroud: 5,  mukhatat: 1, masoura: 4,  zinnad: 4,  haykal: 1 } },
  colt_python:   { name: "Colt Python",      damage: 23,   ammo: 6,   type: "SEMI", weight: "خفيف",          cost: 4130,  recipe: { hadid: 45,  folath: 35,  baroud: 3,  mukhatat: 1, masoura: 2,  zinnad: 3,  haykal: 1 } },
  colt_m1911:    { name: "COLT M1911",       damage: 13,   ammo: 12,  type: "SEMI", weight: "خفيف",          cost: 3812,  recipe: { hadid: 32,  folath: 20,  baroud: 1,  mukhatat: 1, masoura: 2,  zinnad: 4,  haykal: 1 } },
  beretta_m9:    { name: "BERETTA M9",       damage: 11.2, ammo: 15,  type: "SEMI", weight: "خفيف",          cost: 3254,  recipe: { hadid: 30,  folath: 15,  baroud: 3,  mukhatat: 1, masoura: 3,  zinnad: 1,  haykal: 1 } },
};

function findResourceKey(input: string): string | null {
  const t = input.trim();
  if (WEAPON_ITEMS[t]) return t;
  for (const [k, v] of Object.entries(WEAPON_ITEMS)) {
    if (v.name === t) return k;
  }
  return null;
}

// رول الإدارة الوحيد المخوّل
const ADMIN_ROLE_ID = "1515771920174551051";

function getCurrentWeekId(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

function isAdmin(member: GuildMember | null | undefined): boolean {
  if (!member) return false;
  return member.roles.cache.has(ADMIN_ROLE_ID);
}

function getLogoUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}/public/logo.webp`;
  return "";
}

async function getRobloxAvatar(robloxUsername: string): Promise<string | null> {
  try {
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { data: { id: number }[] };
    const userId = data?.data?.[0]?.id;
    if (!userId) return null;
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );
    if (!thumbRes.ok) return null;
    const thumbData = await thumbRes.json() as { data: { imageUrl: string }[] };
    return thumbData?.data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

function embed(color: number) {
  const e = new EmbedBuilder().setColor(color);
  const logo = getLogoUrl();
  if (logo) e.setThumbnail(logo);
  return e;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Slash Commands Definition ───────────────
const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("عرض لوحة التحكم الرئيسية للبنك"),
  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("لوحة إدارة النظام - للمسؤولين فقط"),
  new SlashCommandBuilder()
    .setName("حساب")
    .setDescription("عرض معلومات حسابك الشخصي"),
  new SlashCommandBuilder()
    .setName("رصيد")
    .setDescription("التحقق من رصيدك الحالي"),
  new SlashCommandBuilder().setName("سجلات").setDescription("عرض آخر معاملاتك"),
  new SlashCommandBuilder()
    .setName("تحويل")
    .setDescription("تحويل مبلغ لحساب آخر")
    .addStringOption((opt) =>
      opt.setName("رقم_الحساب").setDescription("رقم الحساب المستلم").setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt.setName("المبلغ").setDescription("المبلغ المراد تحويله").setRequired(true).setMinValue(1),
    )
    .addStringOption((opt) =>
      opt.setName("pin").setDescription("رمز PIN الخاص بك (4 أرقام)").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("Gun-panel")
    .setDescription("لوحة الأسلحة والموارد"),
  new SlashCommandBuilder()
    .setName("Gun-Admin")
    .setDescription("لوحة إدارة نظام الأسلحة — للمسؤولين فقط"),
].map((c) => c.toJSON());

// ─── Register Slash Commands (guild = instant) ─
async function registerCommands(token: string, clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  const guilds = client.guilds.cache.map((g) => g.id);
  if (guilds.length === 0) {
    console.warn("⚠️ البوت ليس في أي سيرفر بعد");
    return;
  }
  for (const guildId of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`✅ تم تسجيل الأوامر في السيرفر: ${guildId}`);
    } catch (err) {
      console.error(`❌ خطأ في السيرفر ${guildId}:`, err);
    }
  }
}

client.once("clientReady", async (readyClient) => {
  console.log(`✅ البوت شغّال: ${readyClient.user.tag}`);

  readyClient.user.setPresence({
    activities: [
      {
        name: "Powered By FTRP .",
        type: ActivityType.Playing,
      },
    ],
    status: "online",
  });

  const token = process.env.DISCORD_BOT_TOKEN!;
  await registerCommands(token, readyClient.user.id);
  setupCronJobs();
});

// تسجيل الأوامر عند انضمام البوت لسيرفر جديد فوراً
client.on("guildCreate", async (guild) => {
  const token = process.env.DISCORD_BOT_TOKEN!;
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user!.id, guild.id), {
      body: commands,
    });
    console.log(`✅ تم تسجيل الأوامر في السيرفر الجديد: ${guild.name}`);
  } catch (err) {
    console.error("❌ خطأ في تسجيل أوامر السيرفر الجديد:", err);
  }
});

// ─── Cron: رواتب كل خميس 12 ظهراً ───────────
function setupCronJobs() {
  cron.schedule("0 9 * * 4", async () => {
    const db = getDB();
    if (!db.settings.salaryChannelId) return;

    // تحقق: هل صُرفت الرواتب هذا الأسبوع مسبقاً؟
    if ((db.settings as any).lastSalaryWeek === getCurrentWeekId()) {
      console.log("⏭️ الرواتب صُرفت هذا الأسبوع — تم تخطي الصرف التلقائي");
      return;
    }

    const channel = client.channels.cache.get(
      db.settings.salaryChannelId,
    ) as TextChannel;
    if (!channel) return;

    // احسب الرواتب حسب الرتب
    const salaryList: { userId: string; amount: number; roleName: string }[] =
      [];
    for (const [, guild] of client.guilds.cache) {
      const members = await guild.members.fetch().catch(() => null);
      if (!members) continue;
      for (const [, gm] of members) {
        if (gm.user.bot) continue;
        const roleIds = gm.roles.cache.map((r: any) => r.id);
        const best = getHighestSalaryForMember(roleIds);
        if (best)
          salaryList.push({
            userId: gm.user.id,
            amount: best.amount,
            roleName: best.name,
          });
      }
    }

    const result = payRoleSalaries(salaryList, "auto-cron");
    updateSettings({ lastSalaryWeek: getCurrentWeekId() } as any);
    const e = embed(DARK_BLUE)
      .setTitle("💰 تم صرف الرواتب التلقائي")
      .setDescription("**يوم الخميس — صرف الرواتب الأسبوعي حسب الرتب**")
      .addFields(
        { name: "عدد الموظفين", value: `${result.count}`, inline: true },
        {
          name: "إجمالي المبلغ",
          value: `${result.paid.toLocaleString()} ريال`,
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({ text: "نظام الرواتب التلقائي" });
    await channel.send({ content: "@everyone", embeds: [e] });
  });
}

// ─── Main Panel ───────────────────────────────
async function sendMainPanel(channel: TextChannel) {
  const e = embed(DARK_BLUE)
    .setTitle("🏦 نظام إدارة الحسابات البنكية")
    .setDescription("اختر من القائمة أدناه ما تريد القيام به")
    .addFields(
      { name: "🪪 إنشاء حساب", value: "فتح حساب جديد في النظام", inline: true },
      { name: "💳 حسابي", value: "عرض رصيدك ومعلومات حسابك", inline: true },
      { name: "💸 تحويل", value: "تحويل مبلغ لحساب آخر", inline: true },
      { name: "📋 السجلات", value: "عرض آخر معاملاتك", inline: true },
    )
    .setTimestamp()
    .setFooter({ text: "نظام البنك | جميع المعاملات مسجّلة" });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("main_menu")
    .setPlaceholder("📋 اختر ما تريد...")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("فتح حساب").setValue("open_account").setDescription("فتح حساب جديد في النظام").setEmoji("🪪"),
      new StringSelectMenuOptionBuilder().setLabel("حسابي").setValue("my_account").setDescription("عرض رصيدك ومعلومات حسابك").setEmoji("💳"),
      new StringSelectMenuOptionBuilder().setLabel("إيداع كاش → بنك").setValue("deposit_btn").setDescription("تحويل كاش إلى رصيد بنكي").setEmoji("🏦"),
      new StringSelectMenuOptionBuilder().setLabel("سحب بنك → كاش").setValue("withdraw_btn").setDescription("تحويل رصيد بنكي إلى كاش").setEmoji("💵"),
      new StringSelectMenuOptionBuilder().setLabel("تحويل أموال").setValue("transfer_btn").setDescription("تحويل مبلغ لحساب آخر").setEmoji("💸"),
      new StringSelectMenuOptionBuilder().setLabel("سجل المعاملات").setValue("my_transactions").setDescription("عرض آخر معاملاتك").setEmoji("📋"),
      new StringSelectMenuOptionBuilder().setLabel("لوحة الإدارة").setValue("admin_panel").setDescription("للمسؤولين فقط").setEmoji("🔧"),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  await channel.send({ embeds: [e], components: [row] });
}

async function sendAdminPanel(channel: TextChannel) {
  const e = embed(DARK_BLUE)
    .setTitle("🔧 لوحة إدارة النظام")
    .setDescription("أدوات الإدارة — للمسؤولين فقط")
    .addFields(
      { name: "❄️ تجميد حساب", value: "تجميد أو رفع تجميد حساب", inline: true },
      { name: "🗑️ حذف حساب", value: "حذف حساب بنكي نهائياً", inline: true },
      { name: "💰 صرف الرواتب", value: "صرف رواتب الموظفين حسب الرتبة", inline: true },
      { name: "📊 جميع الحسابات", value: "عرض قائمة الحسابات", inline: true },
      { name: "➕ إضافة مال", value: "إضافة مبلغ لحساب معين", inline: true },
      { name: "➖ إزالة مال", value: "خصم مبلغ من حساب معين", inline: true },
      { name: "📜 كل السجلات", value: "عرض آخر المعاملات", inline: true },
      { name: "⚙️ الإعدادات", value: "ضبط القنوات وقنوات اللوق", inline: true },
    )
    .setTimestamp()
    .setFooter({ text: "لوحة الإدارة" });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("admin_menu")
    .setPlaceholder("💻 اختر اجراء اداري...")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("تجميد / رفع تجميد حساب").setValue("admin_freeze").setDescription("تجميد أو رفع التجميد عن حساب").setEmoji("🔐"),
      new StringSelectMenuOptionBuilder().setLabel("حذف حساب بنكي").setValue("admin_delete_account").setDescription("حذف حساب نهائياً من النظام").setEmoji("🗑️"),
      new StringSelectMenuOptionBuilder().setLabel("صرف الرواتب").setValue("admin_pay_salary").setDescription("صرف رواتب الموظفين حسب الرتبة").setEmoji("💰"),
      new StringSelectMenuOptionBuilder().setLabel("جميع الحسابات").setValue("admin_all_accounts").setDescription("عرض قائمة بكل الحسابات").setEmoji("📊"),
      new StringSelectMenuOptionBuilder().setLabel("إضافة مال لحساب").setValue("admin_add_balance").setDescription("إضافة مبلغ لحساب معين").setEmoji("➕"),
      new StringSelectMenuOptionBuilder().setLabel("إزالة مال من حساب").setValue("admin_remove_balance").setDescription("خصم مبلغ من حساب معين").setEmoji("➖"),
      new StringSelectMenuOptionBuilder().setLabel("إضافة للجميع").setValue("admin_bulk_add").setDescription("إضافة مبلغ لجميع الحسابات").setEmoji("🖱️"),
      new StringSelectMenuOptionBuilder().setLabel("إزالة من الجميع").setValue("admin_bulk_remove").setDescription("خصم مبلغ لجميع الحسابات").setEmoji("🖲️"),
      new StringSelectMenuOptionBuilder().setLabel("تغيير الإيبان").setValue("admin_change_iban").setDescription("تغيير رقم حساب لإيبان جديد").setEmoji("🔢"),
      new StringSelectMenuOptionBuilder().setLabel("كل السجلات").setValue("admin_all_transactions").setDescription("عرض آخر المعاملات في النظام").setEmoji("📑"),
      new StringSelectMenuOptionBuilder().setLabel("تسجيل سرقة").setValue("admin_robbery").setDescription("تسجيل سرقة").setEmoji("🥷"),
      new StringSelectMenuOptionBuilder().setLabel("سجل السرقات").setValue("admin_robbery_logs").setDescription("عرض آخر السرقات المسجّلة").setEmoji("💱"),
      new StringSelectMenuOptionBuilder().setLabel("الإعدادات").setValue("admin_settings").setDescription("ضبط القنوات وقنوات اللوق").setEmoji("⚙️"),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  await channel.send({ embeds: [e], components: [row] });
}


// ─── Slash Command Handler ────────────────────
async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
  const { commandName, user, member, channel } = interaction;

  if (commandName === "panel") {
    await sendMainPanel(channel as TextChannel);
    return interaction.reply({
      content: "✅  تم إرسال اللوحة بنجاح.",
      ephemeral: true,
    });
  }

  if (commandName === "admin") {
    const m = member as GuildMember;
    if (!isAdmin(m)) {
      return interaction.reply({
        content: "❌ لاتمتلك صلاحية للوصول للوحة الإدارة.",
        ephemeral: true,
      });
    }
    await sendAdminPanel(channel as TextChannel);
    return interaction.reply({
      content: "✅ تم إرسال لوحة الإدارة.",
      ephemeral: true,
    });
  }

  if (commandName === "حساب" || commandName === "رصيد") {
    const account = getAccountByUserId(user.id);
    if (!account) {
      return interaction.reply({
        embeds: [
          embed(DARK_BLUE)
            .setTitle("❌ لا تمتلك حساب")
            .setDescription("استخدم `/panel` ثم اضغط **فتح حساب**."),
        ],
        ephemeral: true,
      });
    }
    const slashCash = account.cash ?? 0;
    const slashTotal = account.balance + slashCash;
    const e = embed(account.frozen ? RED : DARK_BLUE)
      .setTitle("💳 معلومات حسابك")
      .addFields(
        { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
        { name: "💵 كاش", value: `**${slashCash.toLocaleString()} ريال**`, inline: true },
        { name: "🏦 رصيد البنك", value: `**${account.balance.toLocaleString()} ريال**`, inline: true },
        { name: "💰 الإجمالي", value: `**${slashTotal.toLocaleString()} ريال**`, inline: true },
        { name: "الراتب الأسبوعي", value: `**${account.salary.toLocaleString()} ريال**`, inline: true },
        { name: "الحالة", value: account.frozen ? "🔴 مجمّد" : "🟢 نشط", inline: true },
        { name: "تاريخ الإنشاء", value: new Date(account.createdAt).toLocaleDateString("ar-SA"), inline: true },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (commandName === "سجلات") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({
        content: "❌ لا يوجد لديك حساب.",
        ephemeral: true,
      });
    const txs = getTransactions(account.id, 10);
    const e = embed(DARK_BLUE)
      .setTitle("📋 آخر معاملاتك")
      .setDescription(
        txs.length === 0
          ? "لا توجد معاملات بعد."
          : txs
              .map(
                (t) =>
                  `• ${t.description}\n  🕒 ${new Date(t.timestamp).toLocaleString("ar-SA")}`,
              )
              .join("\n\n"),
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (commandName === "تحويل") {
    const toAccountId = interaction.options.getString("رقم_الحساب", true).trim();
    const amount = interaction.options.getInteger("المبلغ", true);
    const pinInput = interaction.options.getString("pin", true).trim();
    const fromAccount = getAccountByUserId(user.id);
    if (!fromAccount)
      return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (fromAccount.frozen)
      return interaction.reply({ content: "❌ حسابك مجمّد.", ephemeral: true });
    if (pinInput !== fromAccount.pin)
      return interaction.reply({ content: "❌ رمز PIN غير صحيح.", ephemeral: true });

    const result = transfer(fromAccount.id, toAccountId, amount, user.id);
    if (!result.success) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE).setTitle("❌ فشل التحويل").setDescription(result.error!)],
        ephemeral: true,
      });
    }
    const updatedFrom = getAccountById(fromAccount.id);
    const toAccount = getAccountById(toAccountId);
    // DM للمستلم
    if (toAccount) {
      const recipient = await client.users.fetch(toAccount.userId).catch(() => null);
      if (recipient) {
        await recipient.send({
          embeds: [embed(DARK_BLUE)
            .setTitle("💸 وصلك تحويل!")
            .addFields(
              { name: "من", value: `<@${user.id}>`, inline: true },
              { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
              { name: "رصيدك الجديد", value: `${toAccount.balance.toLocaleString()} ريال`, inline: true },
            )
            .setTimestamp()
          ],
        }).catch(() => {});
      }
    }
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("✅ تم التحويل بنجاح")
        .addFields(
          { name: "من حساب", value: `**${fromAccount.id}**`, inline: true },
          { name: "إلى حساب", value: `**${toAccountId}**`, inline: true },
          { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
          { name: "رصيدك الجديد", value: `${updatedFrom?.balance.toLocaleString()} ريال`, inline: true },
        )
        .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (commandName === "اسلحة") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({ content: "❌ لا يوجد لديك حساب بنكي.", ephemeral: true });
    const menu = new StringSelectMenuBuilder()
      .setCustomId("weapons_panel")
      .setPlaceholder("⚔️ اختر موردًا أو خيارًا...")
      .addOptions(
        ...Object.entries(WEAPON_ITEMS).map(([key, item]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${item.name} — ${item.price.toLocaleString()}$`)
            .setValue(`wresource_${key}`)
            .setDescription(item.desc.slice(0, 100))
            .setEmoji(item.emoji)
        ),
        new StringSelectMenuOptionBuilder().setLabel("خزنتي الخاصة").setValue("wvault").setDescription("عرض مخزونك من الموارد").setEmoji("🗄️"),
        new StringSelectMenuOptionBuilder().setLabel("أسلحتي").setValue("wmy_weapons").setDescription("عرض الأسلحة المملوكة لك").setEmoji("🔫"),
        new StringSelectMenuOptionBuilder().setLabel("تحويل سلاح").setValue("wtransfer_weapon").setDescription("تحويل سلاح مملوك لشخص آخر").setEmoji("📤"),
        new StringSelectMenuOptionBuilder().setLabel("قائمة الأسلحة").setValue("wweapons_list").setDescription("عرض الأسلحة القابلة للتصنيع ووصفاتها").setEmoji("⚙️"),
        new StringSelectMenuOptionBuilder().setLabel("تفعيل سلاح").setValue("wactivate").setDescription("تقديم طلب تفعيل سلاح").setEmoji("🔑"),
      );
    const db = getDB();
    const stockLines = Object.entries(WEAPON_ITEMS)
      .map(([k, v]) => `${v.emoji} **${v.name}** — ${v.price.toLocaleString()}$  |  مخزون: ${(db.weaponStock ?? {})[k] ?? 0}`)
      .join("\n");
    const e = embed(DARK_BLUE)
      .setTitle("⚔️ نظام الأسلحة والموارد")
      .setDescription("اختر موردًا لعرض تفاصيله وشرائه، أو استعرض خزنتك وقائمة الأسلحة.\n\n" + stockLines)
      .setTimestamp();
    return interaction.reply({
      embeds: [e],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  }

  if (commandName === "اسلحة-ادمن") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const menu = new StringSelectMenuBuilder()
      .setCustomId("weapons_admin")
      .setPlaceholder("🔧 اختر إجراءً إدارياً...")
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel("عرض الستوك").setValue("wadmin_stock_view").setDescription("عرض الكمية المتاحة من كل مورد").setEmoji("📦"),
        new StringSelectMenuOptionBuilder().setLabel("تعيين الستوك").setValue("wadmin_stock_set").setDescription("تعيين كمية مورد معين").setEmoji("🔧"),
        new StringSelectMenuOptionBuilder().setLabel("إضافة موارد لشخص").setValue("wadmin_add_res").setDescription("إضافة موارد لحساب محدد").setEmoji("➕"),
        new StringSelectMenuOptionBuilder().setLabel("سحب موارد من شخص").setValue("wadmin_remove_res").setDescription("سحب موارد من حساب محدد").setEmoji("➖"),
        new StringSelectMenuOptionBuilder().setLabel("عرض مخزون شخص").setValue("wadmin_view_inv").setDescription("عرض مخزون حساب محدد").setEmoji("👁️"),
        new StringSelectMenuOptionBuilder().setLabel("عرض أسلحة شخص").setValue("wadmin_view_weapons").setDescription("عرض الأسلحة المملوكة لمستخدم").setEmoji("🔫"),
        new StringSelectMenuOptionBuilder().setLabel("إعطاء سلاح لشخص").setValue("wadmin_give_weapon").setDescription("إعطاء سلاح مصنوع لمستخدم").setEmoji("🎁"),
        new StringSelectMenuOptionBuilder().setLabel("سحب سلاح من شخص").setValue("wadmin_take_weapon").setDescription("سحب سلاح مصنوع من مستخدم").setEmoji("🔻"),
        new StringSelectMenuOptionBuilder().setLabel("قناة لوق تحويل الأسلحة").setValue("wadmin_transfer_log_set").setDescription("تعيين قناة تسجيل تحويلات الأسلحة").setEmoji("📋"),
        new StringSelectMenuOptionBuilder().setLabel("إعداد قناة التفعيل").setValue("wadmin_activation_log_set").setDescription("تعيين قناة لوق تفعيل الأسلحة").setEmoji("⚙️"),
      );
    const e = embed(DARK_BLUE)
      .setTitle("🔧 إدارة نظام الأسلحة")
      .setDescription("اختر إجراءً من القائمة أدناه.")
      .setTimestamp();
    return interaction.reply({
      embeds: [e],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  }
}

// ─── Interaction Router ───────────────────────
client.on("interactionCreate", async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand())
      return handleSlashCommand(interaction);
    if (interaction.isButton()) return handleButton(interaction);
    if (interaction.isStringSelectMenu()) return handleSelect(interaction);
    if (interaction.isModalSubmit()) return handleModal(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      await interaction
        .reply({ content: "❌ حدث خطأ غير متوقع.", ephemeral: true })
        .catch(() => {});
    }
  }
});

// ─── Select Menu Handler ──────────────────────
async function handleSelect(interaction: StringSelectMenuInteraction) {
  // نعيد توجيه اختيار القائمة كأنه ضغطة زر بنفس الـ ID
  const value = interaction.values[0];
  (interaction as any).customId = value;
  return handleButton(interaction as any);
}

// ─── Button Handler ───────────────────────────
async function handleButton(interaction: any) {
  const { customId, user, guild, channel, member } = interaction;

  if (customId === "open_account") {
    const existing = getAccountByUserId(user.id);
    if (existing) {
      return interaction.reply({
        embeds: [
          embed(DARK_BLUE)
            .setTitle("❌ لديك حساب بالفعل")
            .setDescription(
              `رقم حسابك: **${existing.id}**\nرصيدك: **${existing.balance.toLocaleString()} ريال**`,
            ),
        ],
        ephemeral: true,
      });
    }
    const modal = new ModalBuilder()
      .setCustomId("modal_open_account")
      .setTitle("🏦 فتح حساب جديد");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("الاسم الكامل")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("الاسم الكامل رول بلاي"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("roblox_username")
          .setLabel("اسم مستخدم روبلوكس")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("يوزرك في روبلوكس"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("age")
          .setLabel("العمر")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("العمر رول بلاي"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("pin")
          .setLabel("رمز PIN (4 أرقام — احتفظ به سراً)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(4)
          .setMaxLength(4)
          .setPlaceholder("اكتب الإيبان الخاص بك مكون من 4 ارقام"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "my_account") {
    const account = getAccountByUserId(user.id);
    if (!account) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE).setTitle("❌ لا يوجد لديك حساب").setDescription("اضغط **فتح حساب** لإنشاء حساب جديد.")],
        ephemeral: true,
      });
    }
    const cash = account.cash ?? 0;
    const total = account.balance + cash;
    const e = embed(account.frozen ? RED : DARK_BLUE)
      .setTitle("💳 معلومات حسابك")
      .addFields(
        { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
        { name: "💵 كاش", value: `**${cash.toLocaleString()} ريال**`, inline: true },
        { name: "🏦 رصيد البنك", value: `**${account.balance.toLocaleString()} ريال**`, inline: true },
        { name: "💰 الإجمالي", value: `**${total.toLocaleString()} ريال**`, inline: true },
        { name: "الراتب الأسبوعي", value: `**${account.salary.toLocaleString()} ريال**`, inline: true },
        { name: "الحالة", value: account.frozen ? "🔴 مجمّد" : "🟢 نشط", inline: true },
        { name: "تاريخ الإنشاء", value: new Date(account.createdAt).toLocaleDateString("ar-SA"), inline: true },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "deposit_btn") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (account.frozen)
      return interaction.reply({ content: "❌ حسابك مجمّد.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_deposit").setTitle("🏦 إيداع في البنك");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`الكاش المتاح: ${(account.cash ?? 0).toLocaleString()} ريال — المبلغ المراد إيداعه`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("المبلغ المراد إيداعه الى البنك"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "withdraw_btn") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (account.frozen)
      return interaction.reply({ content: "❌ حسابك مجمّد.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_withdraw").setTitle("💵 سحب من البنك إلى الكاش");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`رصيد البنك: ${account.balance.toLocaleString()} ريال — المبلغ المراد سحبه`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("اكتب المبلغ المراد سحبه من البنك"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "transfer_btn") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({
        content: "❌ لا يوجد لديك حساب.",
        ephemeral: true,
      });
    if (account.frozen)
      return interaction.reply({
        content: "❌ حسابك مجمّد لا يمكنك التحويل.",
        ephemeral: true,
      });
    const modal = new ModalBuilder()
      .setCustomId("modal_transfer")
      .setTitle("💸 تحويل أموال");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("to_account")
          .setLabel("رقم الحساب المستلم")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("إيبان الحساب الخاص بالمستلم"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("المبلغ")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("المبلغ المراد تحويله"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("pin")
          .setLabel("رمز PIN الخاص بك (4 أرقام)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(4)
          .setMaxLength(4)
          .setPlaceholder("****"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("سبب التحويل (اختياري)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100)
          .setPlaceholder("مثال: دفع إيجار، راتب، إلخ..."),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "my_transactions") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({
        content: "❌ لا يوجد لديك حساب.",
        ephemeral: true,
      });
    const txs = getTransactions(account.id, 10);
    const e = embed(DARK_BLUE)
      .setTitle("📋 آخر معاملاتك")
      .setDescription(
        txs.length === 0
          ? "لا توجد معاملات بعد."
          : txs
              .map(
                (t) =>
                  `• ${t.description}\n  🕒 ${new Date(t.timestamp).toLocaleString("ar-SA")}`,
              )
              .join("\n\n"),
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "admin_panel") {
    const m = member as GuildMember;
    if (!isAdmin(m)) {
      return interaction.reply({
        content: "❌ ليس لديك صلاحية للإدارة.",
        ephemeral: true,
      });
    }
    await sendAdminPanel(channel as TextChannel);
    return interaction.reply({
      content: "✅ تم فتح لوحة الإدارة.",
      ephemeral: true,
    });
  }

  if (customId === "admin_freeze") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const modal = new ModalBuilder()
      .setCustomId("modal_freeze")
      .setTitle("تجميد / الغاء تجميد حساب");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("account_id")
          .setLabel("رقم الحساب")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("إيبان الحساب"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("action")
          .setLabel('الإجراء: اكتب "تجميد" أو "الغاء"')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("تجميد أو الغاء"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_pay_salary") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_pay_salary")
        .setLabel("تأكيد صرف الرواتب")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId("cancel_action")
        .setLabel("إلغاء")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
    );
    return interaction.reply({
      embeds: [
        embed(DARK_BLUE)
          .setTitle("⚠️ تأكيد صرف الرواتب")
          .setDescription("هل تريد صرف رواتب جميع الموظفين الآن؟"),
      ],
      components: [row],
      ephemeral: true,
    });
  }

  if (customId === "confirm_pay_salary") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });

    // تحقق: هل صُرفت الرواتب هذا الأسبوع مسبقاً؟
    const dbCheck = getDB();
    if ((dbCheck.settings as any).lastSalaryWeek === getCurrentWeekId()) {
      return interaction.update({
        embeds: [
          embed(RED)
            .setTitle("⛔ تم صرف الرواتب مسبقاً")
            .setDescription("الرواتب صُرفت هذا الأسبوع بالفعل — لا يمكن الصرف مرتين في نفس الأسبوع.")
        ],
        components: [],
      });
    }

    // جلب أعضاء السيرفر وحساب رواتبهم حسب الرتبة
    await interaction.deferUpdate();
    const guildMembers = await guild.members.fetch().catch(() => null);
    const salaryList: { userId: string; amount: number; roleName: string }[] =
      [];

    if (guildMembers) {
      for (const [, gm] of guildMembers) {
        if (gm.user.bot) continue;
        const roleIds = gm.roles.cache.map((r: any) => r.id);
        const best = getHighestSalaryForMember(roleIds);
        if (best) {
          salaryList.push({
            userId: gm.user.id,
            amount: best.amount,
            roleName: best.name,
          });
        }
      }
    }

    const result = payRoleSalaries(salaryList, user.id);
    updateSettings({ lastSalaryWeek: getCurrentWeekId() } as any);
    const db = getDB();
    const e = embed(DARK_BLUE)
      .setTitle("💰 تم صرف الرواتب بنجاح")
      .setDescription("تم الصرف حسب الرتب المحددة")
      .addFields(
        { name: "عدد الموظفين", value: `${result.count}`, inline: true },
        {
          name: "إجمالي المبلغ",
          value: `${result.paid.toLocaleString()} ريال`,
          inline: true,
        },
        { name: "صرف بواسطة", value: `<@${user.id}>`, inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [e], components: [] });
    if (db.settings.salaryChannelId) {
      const salaryChannel = client.channels.cache.get(
        db.settings.salaryChannelId,
      ) as TextChannel;
      if (salaryChannel) await salaryChannel.send({ content: "@everyone", embeds: [e] });
    }
    return;
  }

  if (customId === "cancel_action") {
    return interaction.update({
      embeds: [embed(DARK_BLUE).setTitle("❌ تم الإلغاء")],
      components: [],
    });
  }

  if (customId === "admin_all_accounts") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const accounts = getAllAccounts();
    const lines = accounts.map((acc) => {
      const c = acc.cash ?? 0;
      return `**#${acc.id}** — <@${acc.userId}>\n💵 كاش: ${c.toLocaleString()} | 🏦 بنك: ${acc.balance.toLocaleString()} | 💰 إجمالي: ${(acc.balance + c).toLocaleString()} | ${acc.frozen ? "🔴مجمّد" : "🟢نشط"}`;
    });
    const e = embed(DARK_BLUE)
      .setTitle(`📊 جميع الحسابات (${accounts.length})`)
      .setDescription(
        lines.length === 0
          ? "لا توجد حسابات."
          : lines.slice(0, 15).join("\n\n"),
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "admin_add_balance") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const modal = new ModalBuilder()
      .setCustomId("modal_add_balance")
      .setTitle("➕ إضافة مال لحساب");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("account_id")
          .setLabel("رقم الحساب")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("المبلغ المراد إضافته")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("target")
          .setLabel("المحفظة (بنك / كاش)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("بنك أو كاش"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_remove_balance") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const modal = new ModalBuilder()
      .setCustomId("modal_remove_balance")
      .setTitle("➖ إزالة مال من حساب");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("account_id")
          .setLabel("رقم الحساب")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("مثال: 1001"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("المبلغ المراد خصمه")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("مثال: 1000"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("target")
          .setLabel("المحفظة (بنك / كاش)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("بنك أو كاش"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_change_iban") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_change_iban").setTitle("🔢 تغيير الإيبان");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("old_id").setLabel("رقم الحساب الحالي").setStyle(TextInputStyle.Short).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("new_id").setLabel("الإيبان الجديد (4 أرقام)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(4).setPlaceholder("مثال: 2500"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_bulk_add") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_bulk_add").setTitle("➕ إضافة للجميع");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("value").setLabel("المبلغ أو النسبة المئوية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 1000 أو 10"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("mode").setLabel("النوع: مبلغ / نسبة").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مبلغ أو نسبة"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("target").setLabel("المحفظة: بنك / كاش").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بنك أو كاش"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_bulk_remove") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_bulk_remove").setTitle("➖ إزالة من الجميع");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("value").setLabel("المبلغ أو النسبة المئوية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 1000 أو 10"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("mode").setLabel("النوع: مبلغ / نسبة").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مبلغ أو نسبة"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("target").setLabel("المحفظة: بنك / كاش").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بنك أو كاش"),
      ),
    );
    return interaction.showModal(modal);
  }

  // ─── نظام السرقة ─────────────────────────────

  if (customId === "admin_robbery") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });

    const e = embed(DARK_BLUE)
      .setTitle("🔫 تسجيل سرقة ERLC")
      .setDescription("اختر نوع السرقة لتوزيع الغنائم على المشاركين")
      .addFields(
        { name: "🏧 صرافة (ATM)", value: `**3,000 ريال**\nالشرطة: 2-4 | المواطنين: 1-4`, inline: true },
        { name: "🏪 كاشير", value: `**2,000 ريال**\nالشرطة: 2-6 | المواطنين: 1-5`, inline: true },
        { name: "🏠 منزل", value: `**5,000 ريال**\nالشرطة: 4-6 | المجرمين: 2-6`, inline: true },
      )
      .setFooter({ text: "المبالغ تُضاف كـ كاش مباشرة • يُشترط العدد المحدد وإلا لن تُصرف الغنيمة" })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("robbery_atm").setLabel("صرافة (ATM)").setStyle(ButtonStyle.Primary).setEmoji("🏧"),
      new ButtonBuilder().setCustomId("robbery_cashier").setLabel("كاشير").setStyle(ButtonStyle.Primary).setEmoji("🏪"),
      new ButtonBuilder().setCustomId("robbery_house").setLabel("منزل").setStyle(ButtonStyle.Primary).setEmoji("🏠"),
    );
    return interaction.reply({ embeds: [e], components: [row], ephemeral: true });
  }

  if (customId === "robbery_atm" || customId === "robbery_cashier" || customId === "robbery_house") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });

    const rType = customId.replace("robbery_", "") as RobberyType;
    const cfg = ROBBERY_CONFIG[rType];
    const modal = new ModalBuilder()
      .setCustomId(`modal_robbery_${rType}`)
      .setTitle(`${cfg.emoji} سرقة — ${cfg.name}`);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("police_count")
          .setLabel(`عدد الشرطة الحاضرين (${cfg.policeMin}-${cfg.policeMax})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("الشرطة الحاضرين"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("civilian_count")
          .setLabel(`عدد ${cfg.civilLabel} الحاضرين (${cfg.civilMin}-${cfg.civilMax})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("المواطنين الحاضرين"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("robber_account")
          .setLabel("رقم حساب الشخص الي سرق (واحد فقط)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("إيبان"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_robbery_logs") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const logs = getRobberyLogs(10);
    const e = embed(DARK_BLUE)
      .setTitle("📋 آخر السرقات المسجّلة")
      .setDescription(
        logs.length === 0
          ? "لا توجد سرقات مسجّلة بعد."
          : logs.map((l) =>
              `**${l.emoji ?? "🔫"} ${l.typeName}** — ${l.amountPerPerson.toLocaleString()} ريال/شخص\n` +
              `👮 شرطة: ${l.policeAccounts.join(", ")} | 👤 مواطنين: ${l.civilianAccounts.join(", ")}\n` +
              `💰 إجمالي: ${l.totalPaid.toLocaleString()} ريال | 🕒 ${new Date(l.timestamp).toLocaleString("ar-SA")}`
            ).join("\n\n"),
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "admin_all_transactions") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const txs = getTransactions(undefined, 15);
    const e = embed(DARK_BLUE)
      .setTitle("📜 آخر المعاملات")
      .setDescription(
        txs.length === 0
          ? "لا توجد معاملات."
          : txs
              .map(
                (t) =>
                  `• ${t.description}\n  🕒 ${new Date(t.timestamp).toLocaleString("ar-SA")}`,
              )
              .join("\n\n"),
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "admin_settings") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const db = getDB();
    const modal = new ModalBuilder()
      .setCustomId("modal_settings")
      .setTitle("⚙️ إعدادات النظام");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("salary_channel")
          .setLabel("📢 ID قناة إعلانات الرواتب")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(db.settings.salaryChannelId ?? "")
          .setPlaceholder("اتركه فارغاً إذا لم تريد تغييره"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("request_channel")
          .setLabel("📝 ID قناة طلبات إنشاء الحسابات")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(db.settings.requestChannelId ?? "")
          .setPlaceholder("اتركه فارغاً إذا لم تريد تغييره"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("robbery_channel")
          .setLabel("🔫 ID قناة لوق السرقات (ERLC)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(db.settings.robberyLogChannelId ?? "")
          .setPlaceholder("اتركه فارغاً إذا لم تريد تغييره"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("create_log_channel")
          .setLabel("✅ ID قناة لوق إنشاء الحسابات")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(db.settings.createLogChannelId ?? "")
          .setPlaceholder("اتركه فارغاً إذا لم تريد تغييره"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("delete_log_channel")
          .setLabel("🗑️ ID قناة لوق حذف الحسابات")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(db.settings.deleteLogChannelId ?? "")
          .setPlaceholder("اتركه فارغاً إذا لم تريد تغييره"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_delete_account") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder()
      .setCustomId("modal_delete_account")
      .setTitle("🗑️ حذف حساب بنكي");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("account_id")
          .setLabel("رقم الحساب المراد حذفه")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("إيبان الحساب"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId.startsWith("approve_account_")) {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const reqId = customId.replace("approve_account_", "");
    const pending = removePendingRequest(reqId);
    if (!pending)
      return interaction.reply({
        content: "❌ الطلب غير موجود أو تمت معالجته.",
        ephemeral: true,
      });
    const account = createAccount(
      pending.userId,
      pending.username,
      pending.displayName,
      pending.salary ?? 0,
      (pending as any).name || pending.displayName,
      (pending as any).age || 0,
      (pending as any).pin || "0000",
      (pending as any).robloxUsername || "",
    );
    const dbAfter = getDB();
    if (dbAfter.settings.createLogChannelId) {
      const logCh = client.channels.cache.get(dbAfter.settings.createLogChannelId) as TextChannel;
      if (logCh) {
        const robloxUser = (pending as any).robloxUsername || "";
        const avatar = robloxUser ? await getRobloxAvatar(robloxUser) : null;
        const logE = embed(DARK_BLUE)
          .setTitle("✅ حساب جديد — تمت الموافقة")
          .addFields(
            { name: "المستخدم", value: `<@${pending.userId}>`, inline: true },
            { name: "الاسم", value: (pending as any).name || pending.displayName, inline: true },
            { name: "روبلوكس", value: robloxUser || "—", inline: true },
            { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
            { name: "قبل بواسطة", value: `<@${user.id}>`, inline: true },
          ).setTimestamp();
        if (avatar) logE.setThumbnail(avatar);
        await logCh.send({ embeds: [logE] }).catch(() => {});
      }
    }
    const e = embed(DARK_BLUE)
      .setTitle("✅ تمت الموافقة على الحساب")
      .addFields(
        { name: "المستخدم", value: `<@${pending.userId}>`, inline: true },
        { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
        { name: "الراتب", value: `${account.salary.toLocaleString()} ريال`, inline: true },
        { name: "تمت الموافقة بواسطة", value: `<@${user.id}>`, inline: true },
      )
      .setTimestamp();
    await interaction.update({ embeds: [e], components: [] });
    const requestUser = await client.users
      .fetch(pending.userId)
      .catch(() => null);
    if (requestUser) {
      await requestUser
        .send({
          embeds: [
            embed(DARK_BLUE)
              .setTitle("✅ تمت الموافقة على حسابك")
              .setDescription(
                `رقم حسابك: **${account.id}**\nيمكنك الآن استخدام جميع خدمات البنك.`,
              )
              .setTimestamp(),
          ],
        })
        .catch(() => {});
    }
    return;
  }

  if (customId.startsWith("reject_account_")) {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const reqId = customId.replace("reject_account_", "");
    const pending = removePendingRequest(reqId);
    if (!pending)
      return interaction.reply({
        content: "❌ الطلب غير موجود أو تمت معالجته.",
        ephemeral: true,
      });
    const e = embed(DARK_BLUE)
      .setTitle("❌ تم رفض طلب الحساب")
      .addFields(
        { name: "المستخدم", value: `<@${pending.userId}>`, inline: true },
        { name: "تم الرفض بواسطة", value: `<@${user.id}>`, inline: true },
      )
      .setTimestamp();
    await interaction.update({ embeds: [e], components: [] });
    const requestUser = await client.users
      .fetch(pending.userId)
      .catch(() => null);
    if (requestUser) {
      await requestUser
        .send({
          embeds: [
            embed(DARK_BLUE)
              .setTitle("❌ تم رفض طلب حسابك")
              .setDescription("تم رفض طلبك من قِبل الإدارة.")
              .setTimestamp(),
          ],
        })
        .catch(() => {});
    }
    return;
  }

  // ─── Weapons: resource view ───────────────
  if (customId.startsWith("wresource_")) {
    const key = customId.replace("wresource_", "");
    const item = WEAPON_ITEMS[key];
    if (!item) return interaction.reply({ content: "❌ مورد غير معروف.", ephemeral: true });
    const db = getDB();
    const stock = (db.weaponStock ?? {})[key] ?? 0;
    const e = embed(DARK_BLUE)
      .setTitle(`${item.emoji} ${item.name}${item.blackMarket ? "  —  🖤 سوق سوداء" : ""}`)
      .addFields(
        { name: "💰 السعر", value: `**${item.price.toLocaleString()}$** للحبة`, inline: true },
        { name: "📦 المخزون المتاح", value: `**${stock.toLocaleString()}** حبة`, inline: true },
        { name: "📝 الوصف", value: item.desc, inline: false },
      )
      .setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`weapon_buy_${key}`).setLabel("شراء 🛒").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`weapon_transfer_${key}`).setLabel("تحويل موارد 📦").setStyle(ButtonStyle.Primary),
    );
    return interaction.update({ embeds: [e], components: [row] });
  }

  if (customId === "wvault") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const inv = account.inventory ?? {};
    const lines = Object.entries(WEAPON_ITEMS).map(([k, v]) => {
      const qty = inv[k] ?? 0;
      return `${v.emoji} **${v.name}**: ${qty.toLocaleString()} حبة`;
    }).join("\n");
    const e = embed(DARK_BLUE)
      .setTitle("🗄️ خزنتك الخاصة")
      .setDescription(lines || "لا توجد موارد في خزنتك.")
      .setTimestamp();
    return interaction.update({ embeds: [e], components: [] });
  }

  if (customId === "wtransfer_weapon") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const db = getDB();
    const owned = (db.accounts[account.id]?.craftedWeapons ?? {}) as Record<string, number>;
    const hasWeapons = Object.values(owned).some(q => q > 0);
    if (!hasWeapons) return interaction.reply({ content: "❌ لا توجد أسلحة لديك للتحويل.", ephemeral: true });
    const weaponList = Object.entries(CRAFTABLE_WEAPONS)
      .filter(([k]) => (owned[k] ?? 0) > 0)
      .map(([k, w]) => `${w.name} (${owned[k]}) → ${k}`)
      .join(" | ");
    const modal = new ModalBuilder().setCustomId("modal_wtransfer_weapon").setTitle("📤 تحويل سلاح");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("weapon_key").setLabel("اسم أو مفتاح السلاح").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(weaponList.slice(0, 100)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel("الكمية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 1"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("to_iban").setLabel("إيبان المستلم").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مكون من أربعة أرقام"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("pin").setLabel("رمز PIN الخاص بك").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(4).setPlaceholder("****"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wmy_weapons") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const db = getDB();
    const owned = (db.accounts[account.id]?.craftedWeapons ?? {}) as Record<string, number>;
    const weaponLines = Object.entries(CRAFTABLE_WEAPONS)
      .filter(([k]) => (owned[k] ?? 0) > 0)
      .map(([k, w]) => `🔫 **${w.name}**: ${owned[k]} سلاح`)
      .join("\n");
    const e = embed(DARK_BLUE)
      .setTitle("🔫 أسلحتي")
      .setDescription(weaponLines || "لا توجد أسلحة مملوكة.")
      .setTimestamp();
    return interaction.update({ embeds: [e], components: [] });
  }

  if (customId === "wweapons_list") {
    const wMenu = new StringSelectMenuBuilder()
      .setCustomId("weapons_catalog")
      .setPlaceholder("🔫 اختر سلاحًا للعرض...")
      .addOptions(
        Object.entries(CRAFTABLE_WEAPONS).map(([k, w]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(w.name)
            .setValue(`wweapon_${k}`)
            .setDescription(`${w.type} | قوة: ${w.damage} | ذخيرة: ${w.ammo} | ${w.cost.toLocaleString()}$`)
        )
      );
    const e = embed(DARK_BLUE)
      .setTitle("🔫 قائمة الأسلحة القابلة للتصنيع")
      .setDescription("اختر سلاحًا من القائمة لعرض موارده ومواصفاته.")
      .setTimestamp();
    return interaction.update({ embeds: [e], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(wMenu)] });
  }

  if (customId.startsWith("wweapon_")) {
    const wKey = customId.replace("wweapon_", "");
    const w = CRAFTABLE_WEAPONS[wKey];
    if (!w) return interaction.reply({ content: "❌ سلاح غير موجود.", ephemeral: true });
    const recipeLines = Object.entries(w.recipe).map(([rk, qty]) => {
      const ri = WEAPON_ITEMS[rk];
      return ri ? `${ri.emoji} **${ri.name}**: ${qty}` : `${rk}: ${qty}`;
    }).join("\n");
    const e = embed(DARK_BLUE)
      .setTitle(`🔫 ${w.name}`)
      .addFields(
        { name: "⚡ قوة الإصابة", value: `${w.damage}`, inline: true },
        { name: "🔴 ذخيرة / مخزن", value: `${w.ammo}`, inline: true },
        { name: "🔁 النوع", value: w.type, inline: true },
        { name: "⚖️ الوزن", value: w.weight, inline: true },
        { name: "💵 التكلفة الإجمالية", value: `${w.cost.toLocaleString()}$`, inline: true },
        { name: "🔧 الموارد المطلوبة", value: recipeLines, inline: false },
      )
      .setTimestamp();
    return interaction.update({ embeds: [e], components: [] });
  }

  if (customId === "wactivate") {
    const modal = new ModalBuilder().setCustomId("modal_weapon_activate").setTitle("🔑 طلب تفعيل سلاح");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("weapon_name").setLabel("اسم السلاح").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب اسم السلاح بالأنقليزي"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("owner_name").setLabel("اسم صاحب السلاح (المالك)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("يوزر"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("user_of_weapon").setLabel("اسم الذي سيستخدم السلاح").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اذا نفس المالك اكتب نفس اليوزر"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId.startsWith("weapon_buy_")) {
    const key = customId.replace("weapon_buy_", "");
    const item = WEAPON_ITEMS[key];
    if (!item) return interaction.reply({ content: "❌ مورد غير معروف.", ephemeral: true });
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const db = getDB();
    const stock = (db.weaponStock ?? {})[key] ?? 0;
    const modal = new ModalBuilder().setCustomId(`modal_weapon_buy_${key}`).setTitle(`🛒 شراء ${item.emoji} ${item.name}`);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel(`الكمية | السعر: ${item.price}$/حبة | مخزون: ${stock}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("كمية الأسلحة"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("pin").setLabel("رمز PIN").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(4).setPlaceholder("****"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId.startsWith("weapon_transfer_")) {
    const key = customId.replace("weapon_transfer_", "");
    const item = WEAPON_ITEMS[key];
    if (!item) return interaction.reply({ content: "❌ مورد غير معروف.", ephemeral: true });
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const myQty = (account.inventory ?? {})[key] ?? 0;
    const modal = new ModalBuilder().setCustomId(`modal_weapon_transfer_${key}`).setTitle(`📦 تحويل ${item.emoji} ${item.name}`);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("to_iban").setLabel("رقم إيبان المستلم").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مكون من اربعة ارقام"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel(`الكمية | تملك: ${myQty}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 5"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("pin").setLabel("رمز PIN").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(4).setPlaceholder("****"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel("سبب التحويل (اختياري)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder("مثال: تسليم طلب، هدية، إلخ..."),
      ),
    );
    return interaction.showModal(modal);
  }

  // ─── Admin Weapons ────────────────────────
  if (customId === "wadmin_stock_view") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const db = getDB();
    const lines = Object.entries(WEAPON_ITEMS).map(([k, v]) =>
      `${v.emoji} **${v.name}**: ${((db.weaponStock ?? {})[k] ?? 0).toLocaleString()} حبة`
    ).join("\n");
    const e = embed(DARK_BLUE).setTitle("📦 الستوك الحالي").setDescription(lines).setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "wadmin_stock_set") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const keyList = Object.entries(WEAPON_ITEMS).map(([k, v]) => `${v.emoji} ${v.name} → ${k}`).join(" | ");
    const modal = new ModalBuilder().setCustomId("modal_wadmin_set_stock").setTitle("🔧 تعيين الستوك");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("res_key").setLabel("اسم المورد (عربي أو مفتاح)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(keyList.slice(0, 100)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel("الكمية الجديدة").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب كمية الستوك الجديدة"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_add_res") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_wadmin_add_res").setTitle("➕ إضافة موارد لشخص");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("iban").setLabel("رقم الإيبان").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 1001"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("res_key").setLabel("اسم المورد (عربي أو مفتاح)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بارود / baroud / فولاذ / ..."),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel("الكمية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("كمية الموارد المطلوبة"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_remove_res") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_wadmin_remove_res").setTitle("➖ سحب موارد من شخص");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("iban").setLabel("رقم الإيبان").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مكون من 4 ارقام"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("res_key").setLabel("اسم المورد (عربي أو مفتاح)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بارود / baroud / بخاخ عصابات / bakhakh / ..."),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel("الكمية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب كمية الموارد المطلوبة"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_view_inv") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_wadmin_view_inv").setTitle("👁️ عرض مخزون شخص");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("iban").setLabel("رقم الإيبان").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("يتكون من اربعة ارقام"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_view_weapons") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_wadmin_view_weapons").setTitle("🔫 عرض أسلحة مستخدم");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("user_id").setLabel("Discord ID أو منشن المستخدم").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 123456789012345678 أو <@123...>"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_give_weapon") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const weaponList = Object.entries(CRAFTABLE_WEAPONS).map(([k, w]) => `${w.name} → ${k}`).join(" | ");
    const modal = new ModalBuilder().setCustomId("modal_wadmin_give_weapon").setTitle("🎁 إعطاء سلاح لشخص");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("user_id").setLabel("Discord ID أو منشن المستخدم").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 123456789012345678 أو <@123...>"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("weapon_key").setLabel("اسم أو مفتاح السلاح").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(weaponList.slice(0, 100)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel("الكمية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 1"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_take_weapon") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const weaponList = Object.entries(CRAFTABLE_WEAPONS).map(([k, w]) => `${w.name} → ${k}`).join(" | ");
    const modal = new ModalBuilder().setCustomId("modal_wadmin_take_weapon").setTitle("🔻 سحب سلاح من شخص");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("user_id").setLabel("Discord ID أو منشن المستخدم").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 123456789012345678 أو <@123...>"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("weapon_key").setLabel("اسم أو مفتاح السلاح").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(weaponList.slice(0, 100)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("qty").setLabel("الكمية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مثال: 1"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_transfer_log_set") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const db = getDB();
    const modal = new ModalBuilder().setCustomId("modal_wadmin_transfer_log").setTitle("📋 قناة لوق تحويل الأسلحة");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("channel_id").setLabel("ID قناة لوق تحويل الأسلحة").setStyle(TextInputStyle.Short).setRequired(true).setValue((db.settings as any).weaponTransferLogChannelId ?? "").setPlaceholder("مثال: 1234567890"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId === "wadmin_activation_log_set") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const db = getDB();
    const modal = new ModalBuilder().setCustomId("modal_wadmin_activation_log").setTitle("⚙️ قناة لوق التفعيل");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("channel_id").setLabel("ID قناة لوق تفعيل الأسلحة").setStyle(TextInputStyle.Short).setRequired(true).setValue(db.settings.weaponActivationLogChannelId ?? "").setPlaceholder("مثال: 1234567890"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId.startsWith("approve_weapon_act_")) {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const reqId = customId.replace("approve_weapon_act_", "");
    const act = getWeaponActivation(reqId);
    if (!act) return interaction.reply({ content: "❌ الطلب غير موجود.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`modal_weapon_act_code_${reqId}`).setTitle("🔑 إدخال كود تفعيل السلاح");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("code").setLabel(`كود تفعيل سلاح: ${act.weaponName}`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("أدخل الكود السري لاستخدام السلاح"),
      ),
    );
    return interaction.showModal(modal);
  }

  if (customId.startsWith("reject_weapon_act_")) {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const reqId = customId.replace("reject_weapon_act_", "");
    const act = getWeaponActivation(reqId);
    if (!act) return interaction.reply({ content: "❌ الطلب غير موجود.", ephemeral: true });
    updateWeaponActivation(reqId, { status: "rejected" });
    const e = embed(DARK_BLUE)
      .setTitle("❌ طلب تفعيل سلاح — مرفوض")
      .addFields(
        { name: "السلاح", value: act.weaponName, inline: true },
        { name: "مقدم الطلب", value: `<@${act.userId}>`, inline: true },
        { name: "تم الرفض بواسطة", value: `<@${user.id}>`, inline: true },
      ).setTimestamp();
    await interaction.update({ embeds: [e], components: [] });
    const reqUser = await client.users.fetch(act.userId).catch(() => null);
    if (reqUser) await reqUser.send({ embeds: [embed(DARK_BLUE).setTitle("❌ رُفض طلب تفعيل سلاحك").addFields({ name: "السلاح", value: act.weaponName, inline: true }).setTimestamp()] }).catch(() => {});
    return;
  }
}

// ─── Modal Handler ────────────────────────────
async function handleModal(interaction: any) {
  const { customId, user, guild, member } = interaction;

  if (customId === "modal_open_account") {
    const name = interaction.fields.getTextInputValue("name").trim();
    const robloxUsername = interaction.fields.getTextInputValue("roblox_username").trim();
    const age = parseInt(interaction.fields.getTextInputValue("age")) || 0;
    const pin = interaction.fields.getTextInputValue("pin").trim();
    if (!/^\d{4}$/.test(pin))
      return interaction.reply({ content: "❌ رمز PIN يجب أن يكون 4 أرقام فقط.", ephemeral: true });
    if (getAccountByUserId(user.id))
      return interaction.reply({ content: "❌ لديك حساب بالفعل!", ephemeral: true });
    const guildMember = await guild.members.fetch(user.id).catch(() => null);
    const displayName = guildMember?.displayName || user.username;
    const reqId = `${user.id}-${Date.now()}`;
    const db = getDB();

    if (!db.settings.requestChannelId) {
      const account = createAccount(user.id, user.username, displayName, 0, name, age, pin, robloxUsername);
      if (db.settings.createLogChannelId) {
        const logCh = client.channels.cache.get(db.settings.createLogChannelId) as TextChannel;
        if (logCh) {
          const avatar = await getRobloxAvatar(robloxUsername);
          const logE = embed(DARK_BLUE)
            .setTitle("✅ حساب جديد — تم الإنشاء")
            .addFields(
              { name: "المستخدم", value: `<@${user.id}>`, inline: true },
              { name: "الاسم", value: name, inline: true },
              { name: "روبلوكس", value: robloxUsername, inline: true },
              { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
            ).setTimestamp();
          if (avatar) logE.setThumbnail(avatar);
          await logCh.send({ embeds: [logE] }).catch(() => {});
        }
      }
      return interaction.reply({
        embeds: [embed(DARK_BLUE)
          .setTitle("✅ تم إنشاء حسابك بنجاح")
          .addFields(
            { name: "الاسم", value: name, inline: true },
            { name: "روبلوكس", value: robloxUsername, inline: true },
            { name: "رقم الحساب (إيبان)", value: `**${account.id}**`, inline: true },
            { name: "رمز PIN", value: "🔒 تم الحفظ بأمان", inline: true },
          )
          .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    addPendingRequest({
      id: reqId,
      userId: user.id,
      username: user.username,
      displayName,
      name,
      age,
      pin,
      robloxUsername,
      requestedAt: new Date().toISOString(),
      channelId: db.settings.requestChannelId!,
      salary: 0,
    });
    const requestChannel = guild.channels.cache.get(db.settings.requestChannelId) as TextChannel;
    if (requestChannel) {
      const avatar = await getRobloxAvatar(robloxUsername);
      const e = embed(DARK_BLUE)
        .setTitle("📝 طلب إنشاء حساب جديد")
        .addFields(
          { name: "المستخدم", value: `<@${user.id}> (${displayName})`, inline: true },
          { name: "الاسم", value: name, inline: true },
          { name: "روبلوكس", value: robloxUsername, inline: true },
          { name: "العمر", value: `${age}`, inline: true },
          { name: "وقت الطلب", value: new Date().toLocaleString("ar-SA"), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `معرف الطلب: ${reqId}` });
      if (avatar) e.setThumbnail(avatar);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_account_${reqId}`)
          .setLabel("قبول")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId(`reject_account_${reqId}`)
          .setLabel("رفض")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      );
      await requestChannel.send({ embeds: [e], components: [row] });
    }
    return interaction.reply({
      embeds: [
        embed(DARK_BLUE)
          .setTitle("⏳ تم إرسال طلبك")
          .setDescription(
            "تم إرسال طلب فتح الحساب للإدارة. سيتم إشعارك بالنتيجة قريباً.",
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_transfer") {
    const toAccountId = interaction.fields.getTextInputValue("to_account").trim();
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    const pinInput = interaction.fields.getTextInputValue("pin").trim();
    const reason = interaction.fields.getTextInputValue("reason").trim();
    if (isNaN(amount) || amount <= 0)
      return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const fromAccount = getAccountByUserId(user.id);
    if (!fromAccount)
      return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (pinInput !== fromAccount.pin)
      return interaction.reply({ content: "❌ رمز PIN غير صحيح، تم إلغاء التحويل.", ephemeral: true });
    const result = transfer(fromAccount.id, toAccountId, amount, user.id);
    if (!result.success) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE).setTitle("❌ فشل التحويل").setDescription(result.error!)],
        ephemeral: true,
      });
    }
    const updatedFrom = getAccountById(fromAccount.id);
    const toAcct = getAccountById(toAccountId);
    // DM للمستلم
    if (toAcct) {
      const recipient = await client.users.fetch(toAcct.userId).catch(() => null);
      if (recipient) {
        const dmEmbed = embed(DARK_BLUE)
          .setTitle("💸 وصلك تحويل!")
          .addFields(
            { name: "من", value: `<@${user.id}>`, inline: true },
            { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
            { name: "رصيدك الجديد", value: `${toAcct.balance.toLocaleString()} ريال`, inline: true },
          )
          .setTimestamp();
        if (reason) dmEmbed.addFields({ name: "📝 السبب", value: reason, inline: false });
        await recipient.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    }
    const replyEmbed = embed(DARK_BLUE)
      .setTitle("✅ تم التحويل بنجاح")
      .addFields(
        { name: "من حساب", value: `**${fromAccount.id}**`, inline: true },
        { name: "إلى حساب", value: `**${toAccountId}**`, inline: true },
        { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
        { name: "رصيدك الجديد", value: `${updatedFrom?.balance.toLocaleString()} ريال`, inline: true },
      )
      .setTimestamp();
    if (reason) replyEmbed.addFields({ name: "📝 السبب", value: reason, inline: false });
    return interaction.reply({ embeds: [replyEmbed], ephemeral: true });
  }

  if (customId === "modal_freeze") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const accountId = interaction.fields.getTextInputValue("account_id").trim();
    const action = interaction.fields.getTextInputValue("action").trim();
    const doFreeze = action === "تجميد";
    const account = getAccountById(accountId);
    if (!account)
      return interaction.reply({
        content: "❌ الحساب غير موجود.",
        ephemeral: true,
      });
    freezeAccount(accountId, doFreeze, user.id);
    return interaction.reply({
      embeds: [
        embed(doFreeze ? RED : GREEN)
          .setTitle(doFreeze ? "❄️ تم تجميد الحساب" : "✅ تم الغاء التجميد")
          .addFields(
            { name: "رقم الحساب", value: `**${accountId}**`, inline: true },
            { name: "المستخدم", value: `<@${account.userId}>`, inline: true },
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_add_balance") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const accountId = interaction.fields.getTextInputValue("account_id").trim();
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const target: "bank" | "cash" = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(amount) || amount <= 0)
      return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const success = setAccountBalance(accountId, amount, user.id, target);
    if (!success)
      return interaction.reply({ content: "❌ الحساب غير موجود.", ephemeral: true });
    const account = getAccountById(accountId);
    const addedCash = account?.cash ?? 0;
    const addedBank = account?.balance ?? 0;
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("➕ تم إضافة المال")
        .addFields(
          { name: "رقم الحساب", value: `**${accountId}**`, inline: true },
          { name: "المبلغ المضاف", value: `**${amount.toLocaleString()} ريال**`, inline: true },
          { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
          { name: "💵 كاش الآن", value: `${addedCash.toLocaleString()} ريال`, inline: true },
          { name: "🏦 بنك الآن", value: `${addedBank.toLocaleString()} ريال`, inline: true },
          { name: "💰 الإجمالي", value: `${(addedCash + addedBank).toLocaleString()} ريال`, inline: true },
        )
        .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_remove_balance") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const accountId = interaction.fields.getTextInputValue("account_id").trim();
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const target: "bank" | "cash" = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(amount) || amount <= 0)
      return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const result = removeBalance(accountId, amount, user.id, target);
    if (!result.success) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE).setTitle("❌ فشل الخصم").setDescription(result.error!)],
        ephemeral: true,
      });
    }
    const account = getAccountById(accountId);
    const remCash = account?.cash ?? 0;
    const remBank = account?.balance ?? 0;
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("➖ تم خصم المال")
        .addFields(
          { name: "رقم الحساب", value: `**${accountId}**`, inline: true },
          { name: "المبلغ المخصوم", value: `**${amount.toLocaleString()} ريال**`, inline: true },
          { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
          { name: "💵 كاش الآن", value: `${remCash.toLocaleString()} ريال`, inline: true },
          { name: "🏦 بنك الآن", value: `${remBank.toLocaleString()} ريال`, inline: true },
          { name: "💰 الإجمالي", value: `${(remCash + remBank).toLocaleString()} ريال`, inline: true },
        )
        .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_deposit") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    if (isNaN(amount) || amount <= 0)
      return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const result = deposit(account.id, amount, user.id);
    if (!result.success) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE).setTitle("❌ فشل الإيداع").setDescription(result.error!)],
        ephemeral: true,
      });
    }
    const updated = getAccountById(account.id)!;
    const depCash = updated.cash ?? 0;
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("🏦 تم الإيداع بنجاح")
        .addFields(
          { name: "المبلغ المودع", value: `**${amount.toLocaleString()} ريال**`, inline: true },
          { name: "💵 كاش المتبقي", value: `${depCash.toLocaleString()} ريال`, inline: true },
          { name: "🏦 رصيد البنك الجديد", value: `${updated.balance.toLocaleString()} ريال`, inline: true },
          { name: "💰 الإجمالي", value: `${(depCash + updated.balance).toLocaleString()} ريال`, inline: true },
        )
        .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_withdraw") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    if (isNaN(amount) || amount <= 0)
      return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const result = withdraw(account.id, amount, user.id);
    if (!result.success)
      return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("❌ فشل السحب").setDescription(result.error!)], ephemeral: true });
    const updated = getAccountById(account.id)!;
    const wCash = updated.cash ?? 0;
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("💵 تم السحب بنجاح")
        .addFields(
          { name: "المبلغ المسحوب", value: `**${amount.toLocaleString()} ريال**`, inline: true },
          { name: "🏦 رصيد البنك الجديد", value: `${updated.balance.toLocaleString()} ريال`, inline: true },
          { name: "💵 الكاش الجديد", value: `${wCash.toLocaleString()} ريال`, inline: true },
          { name: "💰 الإجمالي", value: `${(wCash + updated.balance).toLocaleString()} ريال`, inline: true },
        ).setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_change_iban") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const oldId = interaction.fields.getTextInputValue("old_id").trim();
    const newId = interaction.fields.getTextInputValue("new_id").trim();
    const result = changeAccountId(oldId, newId, user.id);
    if (!result.success)
      return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("❌ فشل تغيير الإيبان").setDescription(result.error!)], ephemeral: true });
    const account = getAccountById(newId);
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("🔢 تم تغيير الإيبان")
        .addFields(
          { name: "الإيبان القديم", value: `**${oldId}**`, inline: true },
          { name: "الإيبان الجديد", value: `**${newId}**`, inline: true },
          { name: "المستخدم", value: `<@${account?.userId}>`, inline: true },
        ).setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_bulk_add") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const value = parseFloat(interaction.fields.getTextInputValue("value"));
    const rawMode = interaction.fields.getTextInputValue("mode").trim();
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const mode: "amount" | "percent" = rawMode === "نسبة" ? "percent" : "amount";
    const target: "bank" | "cash" = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(value) || value <= 0)
      return interaction.reply({ content: "❌ القيمة غير صحيحة.", ephemeral: true });
    const { count, total } = bulkAddBalance(value, mode, target, user.id);
    const label = mode === "percent" ? `${value}%` : `${value.toLocaleString()} ريال`;
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("➕ تمت الإضافة الجماعية")
        .addFields(
          { name: "القيمة", value: label, inline: true },
          { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
          { name: "عدد الحسابات", value: `${count}`, inline: true },
          { name: "الإجمالي المضاف", value: `${total.toLocaleString()} ريال`, inline: true },
        ).setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  if (customId === "modal_bulk_remove") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const value = parseFloat(interaction.fields.getTextInputValue("value"));
    const rawMode = interaction.fields.getTextInputValue("mode").trim();
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const mode: "amount" | "percent" = rawMode === "نسبة" ? "percent" : "amount";
    const target: "bank" | "cash" = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(value) || value <= 0)
      return interaction.reply({ content: "❌ القيمة غير صحيحة.", ephemeral: true });
    const { count, total } = bulkRemoveBalance(value, mode, target, user.id);
    const label = mode === "percent" ? `${value}%` : `${value.toLocaleString()} ريال`;
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle("➖ تم الخصم الجماعي")
        .addFields(
          { name: "القيمة", value: label, inline: true },
          { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
          { name: "عدد الحسابات", value: `${count}`, inline: true },
          { name: "الإجمالي المخصوم", value: `${total.toLocaleString()} ريال`, inline: true },
        ).setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  // ─── مودالات السرقة ───────────────────────────
  if (customId.startsWith("modal_robbery_")) {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });

    const rType = customId.replace("modal_robbery_", "") as RobberyType;
    const cfg = ROBBERY_CONFIG[rType];

    const policeCount = parseInt(interaction.fields.getTextInputValue("police_count").trim());
    const civilCount  = parseInt(interaction.fields.getTextInputValue("civilian_count").trim());
    const robberAccId = interaction.fields.getTextInputValue("robber_account").trim();

    if (isNaN(policeCount) || policeCount < cfg.policeMin || policeCount > cfg.policeMax) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE)
          .setTitle("❌ عدد الشرطة غير صحيح")
          .setDescription(`عدد الشرطة لازم يكون بين **${cfg.policeMin}** و **${cfg.policeMax}**.\nأدخلت: **${isNaN(policeCount) ? "—" : policeCount}**`)],
        ephemeral: true,
      });
    }

    if (isNaN(civilCount) || civilCount < cfg.civilMin || civilCount > cfg.civilMax) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE)
          .setTitle(`❌ عدد ${cfg.civilLabel} غير صحيح`)
          .setDescription(`عدد ${cfg.civilLabel} لازم يكون بين **${cfg.civilMin}** و **${cfg.civilMax}**.\nأدخلت: **${isNaN(civilCount) ? "—" : civilCount}**`)],
        ephemeral: true,
      });
    }

    const { results } = logRobbery(
      {
        type: rType,
        typeName: cfg.name,
        amountPerPerson: cfg.amount,
        policeAccounts: [`${policeCount} أشخاص`],
        civilianAccounts: [`${civilCount} أشخاص`],
        totalPaid: 0,
        timestamp: new Date().toISOString(),
        performedBy: user.id,
      },
      [{ accountId: robberAccId, amount: cfg.amount, role: "civilian" }],
    );

    const success = results[0]?.paid;
    const errMsg  = results[0]?.error;

    const robberAccount = getAccountById(robberAccId);
    const newCash = robberAccount?.cash ?? 0;

    const logEmbed = embed(DARK_BLUE)
      .setTitle(`${cfg.emoji} سرقة ${cfg.name} — ${success ? "✅ تم الصرف" : "❌ فشل"}`)
      .addFields(
        { name: "🔫 نوع السرقة", value: `**${cfg.name}**`, inline: true },
        { name: "💰 الغنيمة", value: `**${cfg.amount.toLocaleString()} ريال كاش**`, inline: true },
        { name: "🕵️ السارق", value: success ? `✅ حساب #${robberAccId}` : `❌ حساب #${robberAccId}\n${errMsg ?? ""}`, inline: true },
        { name: "👮 شرطة حاضرين", value: `${policeCount} أشخاص`, inline: true },
        { name: `👥 ${cfg.civilLabel} حاضرين`, value: `${civilCount} أشخاص`, inline: true },
        { name: "💵 كاش الحساب الآن", value: success ? `${newCash.toLocaleString()} ريال` : "—", inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `سجّل بواسطة: ${user.username}` });

    await interaction.reply({
      content: success ? `✅ تم تسجيل سرقة **${cfg.name}** بنجاح.` : `❌ فشل الصرف — ${errMsg ?? "خطأ غير معروف"}`,
      ephemeral: true,
    });

    const db = getDB();
    if (db.settings.robberyLogChannelId) {
      const logCh = client.channels.cache.get(db.settings.robberyLogChannelId) as TextChannel;
      if (logCh) await logCh.send({ embeds: [logEmbed] }).catch(() => {});
    }

    if (success && robberAccount) {
      const robberUser = await client.users.fetch(robberAccount.userId).catch(() => null);
      if (robberUser) {
        await robberUser.send({
          embeds: [embed(DARK_BLUE)
            .setTitle(`${cfg.emoji}  🚨 وصلك مبلغ سرقة`)
            .addFields(
              { name: "🔫 نوع السرقة", value: `**${cfg.name}**`, inline: true },
              { name: "💰 الغنيمة", value: `**${cfg.amount.toLocaleString()} ريال كاش**`, inline: true },
              { name: "💵 كاشك الآن", value: `${newCash.toLocaleString()} ريال`, inline: true },
            )
            .setTimestamp()],
        }).catch(() => {});
      }
    }
    return;
  }

  if (customId === "modal_settings") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({
        content: "❌ ليس لديك صلاحية.",
        ephemeral: true,
      });
    const salaryChannel    = interaction.fields.getTextInputValue("salary_channel").trim();
    const requestChannel   = interaction.fields.getTextInputValue("request_channel").trim();
    const robberyChannel   = interaction.fields.getTextInputValue("robbery_channel").trim();
    const createLogChannel = interaction.fields.getTextInputValue("create_log_channel").trim();
    const deleteLogChannel = interaction.fields.getTextInputValue("delete_log_channel").trim();
    const updates: any = {};
    if (salaryChannel)    updates.salaryChannelId       = salaryChannel;
    if (requestChannel)   updates.requestChannelId      = requestChannel;
    if (robberyChannel)   updates.robberyLogChannelId   = robberyChannel;
    if (createLogChannel) updates.createLogChannelId    = createLogChannel;
    if (deleteLogChannel) updates.deleteLogChannelId    = deleteLogChannel;
    updateSettings(updates);
    return interaction.reply({
      embeds: [
        embed(DARK_BLUE)
          .setTitle("⚙️ تم حفظ الإعدادات")
          .addFields(
            salaryChannel    ? { name: "📢 قناة الرواتب",          value: `<#${salaryChannel}>`,    inline: true } : { name: "📢 قناة الرواتب",          value: "لم تتغير", inline: true },
            requestChannel   ? { name: "📝 قناة الطلبات",           value: `<#${requestChannel}>`,   inline: true } : { name: "📝 قناة الطلبات",           value: "لم تتغير", inline: true },
            robberyChannel   ? { name: "🔫 قناة لوق السرقة",        value: `<#${robberyChannel}>`,   inline: true } : { name: "🔫 قناة لوق السرقة",        value: "لم تتغير", inline: true },
            createLogChannel ? { name: "✅ قناة لوق إنشاء الحسابات", value: `<#${createLogChannel}>`, inline: true } : { name: "✅ قناة لوق إنشاء الحسابات", value: "لم تتغير", inline: true },
            deleteLogChannel ? { name: "🗑️ قناة لوق حذف الحسابات",  value: `<#${deleteLogChannel}>`, inline: true } : { name: "🗑️ قناة لوق حذف الحسابات",  value: "لم تتغير", inline: true },
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  }

  // ─── Weapons Modals ──────────────────────────
  if (customId.startsWith("modal_weapon_buy_")) {
    const key = customId.replace("modal_weapon_buy_", "");
    const item = WEAPON_ITEMS[key];
    if (!item) return interaction.reply({ content: "❌ مورد غير معروف.", ephemeral: true });
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const qtyRaw = parseInt(interaction.fields.getTextInputValue("qty"));
    const pinIn  = interaction.fields.getTextInputValue("pin").trim();
    if (isNaN(qtyRaw) || qtyRaw < 1) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    if (pinIn !== account.pin) return interaction.reply({ content: "❌ رمز PIN غير صحيح.", ephemeral: true });
    const result = buyResource(account.id, key, qtyRaw, item.price);
    if (!result.success) return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("❌ فشل الشراء").setDescription(result.error!)], ephemeral: true });
    const total = qtyRaw * item.price;
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle(`✅ تم الشراء — ${item.emoji} ${item.name}`)
        .addFields(
          { name: "الكمية", value: `${qtyRaw.toLocaleString()} حبة`, inline: true },
          { name: "المبلغ المدفوع", value: `${total.toLocaleString()} ريال`, inline: true },
          { name: "رصيدك الجديد", value: `${(account.balance - total).toLocaleString()} ريال`, inline: true },
        ).setTimestamp()],
      ephemeral: true,
    });
  }

  if (customId.startsWith("modal_weapon_transfer_")) {
    const key = customId.replace("modal_weapon_transfer_", "");
    const item = WEAPON_ITEMS[key];
    if (!item) return interaction.reply({ content: "❌ مورد غير معروف.", ephemeral: true });
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const toIban  = interaction.fields.getTextInputValue("to_iban").trim();
    const qtyRaw  = parseInt(interaction.fields.getTextInputValue("qty"));
    const pinIn   = interaction.fields.getTextInputValue("pin").trim();
    const reason  = interaction.fields.getTextInputValue("reason").trim();
    if (isNaN(qtyRaw) || qtyRaw < 1) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    if (pinIn !== account.pin) return interaction.reply({ content: "❌ رمز PIN غير صحيح.", ephemeral: true });
    const toAcc = getAccountById(toIban);
    if (!toAcc) return interaction.reply({ content: `❌ لم يُعثر على حساب برقم **${toIban}**.`, ephemeral: true });
    const result = transferResources(account.id, toIban, key, qtyRaw);
    if (!result.success) return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("❌ فشل التحويل").setDescription(result.error!)], ephemeral: true });
    const recipientUser = await client.users.fetch(toAcc.userId).catch(() => null);
    if (recipientUser) {
      const dmEmbed = embed(DARK_BLUE)
        .setTitle(`📦 وصلتك موارد — ${item.emoji} ${item.name}`)
        .addFields(
          { name: "الكمية", value: `${qtyRaw}`, inline: true },
          { name: "من", value: `<@${user.id}>`, inline: true },
        ).setTimestamp();
      if (reason) dmEmbed.addFields({ name: "📝 السبب", value: reason, inline: false });
      await recipientUser.send({ embeds: [dmEmbed] }).catch(() => {});
    }
    const replyEmbed = embed(DARK_BLUE)
      .setTitle(`✅ تم التحويل — ${item.emoji} ${item.name}`)
      .addFields(
        { name: "الكمية", value: `${qtyRaw}`, inline: true },
        { name: "إلى", value: `<@${toAcc.userId}> (#${toIban})`, inline: true },
      ).setTimestamp();
    if (reason) replyEmbed.addFields({ name: "📝 السبب", value: reason, inline: false });
    return interaction.reply({ embeds: [replyEmbed], ephemeral: true });
  }

  if (customId === "modal_weapon_activate") {
    const weaponName   = interaction.fields.getTextInputValue("weapon_name").trim();
    const ownerName    = interaction.fields.getTextInputValue("owner_name").trim();
    const userOfWeapon = interaction.fields.getTextInputValue("user_of_weapon").trim();
    const db = getDB();
    if (!db.settings.weaponActivationLogChannelId)
      return interaction.reply({ content: "❌ قناة لوق التفعيل غير مضبوطة — تواصل مع الإدارة.", ephemeral: true });
    const logCh = client.channels.cache.get(db.settings.weaponActivationLogChannelId) as TextChannel;
    if (!logCh) return interaction.reply({ content: "❌ لم أجد قناة لوق التفعيل.", ephemeral: true });
    const reqId = `wact-${user.id}-${Date.now()}`;
    addWeaponActivation({ id: reqId, userId: user.id, weaponName, ownerName, userOfWeapon, requestedAt: new Date().toISOString(), status: "pending" });
    const e = embed(DARK_BLUE)
      .setTitle("🔑 طلب تفعيل سلاح")
      .addFields(
        { name: "المقدم", value: `<@${user.id}>`, inline: true },
        { name: "اسم السلاح", value: weaponName, inline: true },
        { name: "صاحب السلاح", value: ownerName, inline: true },
        { name: "المستخدم", value: userOfWeapon, inline: true },
        { name: "الوقت", value: new Date().toLocaleString("ar-SA"), inline: true },
      ).setTimestamp().setFooter({ text: `معرف الطلب: ${reqId}` });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`approve_weapon_act_${reqId}`).setLabel("قبول").setStyle(ButtonStyle.Success).setEmoji("✅"),
      new ButtonBuilder().setCustomId(`reject_weapon_act_${reqId}`).setLabel("رفض").setStyle(ButtonStyle.Danger).setEmoji("❌"),
    );
    await logCh.send({ embeds: [e], components: [row] });
    return interaction.reply({ content: "✅ تم إرسال طلب التفعيل — انتظر موافقة الإدارة.", ephemeral: true });
  }

  if (customId.startsWith("modal_weapon_act_code_")) {
    const reqId = customId.replace("modal_weapon_act_code_", "");
    const act = getWeaponActivation(reqId);
    if (!act) return interaction.reply({ content: "❌ الطلب غير موجود.", ephemeral: true });
    const code = interaction.fields.getTextInputValue("code").trim();
    updateWeaponActivation(reqId, { status: "approved" });
    const e = embed(DARK_BLUE)
      .setTitle("✅ طلب تفعيل سلاح — مقبول")
      .addFields(
        { name: "السلاح", value: act.weaponName, inline: true },
        { name: "مقدم الطلب", value: `<@${act.userId}>`, inline: true },
        { name: "تم القبول بواسطة", value: `<@${user.id}>`, inline: true },
      ).setTimestamp();
    await interaction.update({ embeds: [e], components: [] });
    const reqUser = await client.users.fetch(act.userId).catch(() => null);
    if (reqUser) await reqUser.send({
      embeds: [embed(DARK_BLUE)
        .setTitle("✅ تم قبول طلب تفعيل سلاحك")
        .addFields(
          { name: "🔫 السلاح", value: act.weaponName, inline: true },
          { name: "👤 صاحب السلاح", value: act.ownerName, inline: true },
          { name: "🎯 المستخدم", value: act.userOfWeapon, inline: true },
          { name: "🔑 كود الاستخدام", value: `||\`${code}\`||`, inline: false },
        ).setDescription("⚠️ احتفظ بالكود السري ولا تشاركه مع أي شخص آخر.").setTimestamp()]
    }).catch(() => {});
    return;
  }

  if (customId === "modal_wadmin_set_stock") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const resInput = interaction.fields.getTextInputValue("res_key").trim();
    const qty      = parseInt(interaction.fields.getTextInputValue("qty"));
    if (isNaN(qty) || qty < 0) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    const key = findResourceKey(resInput);
    if (!key) return interaction.reply({ content: `❌ مورد غير معروف: **${resInput}**`, ephemeral: true });
    const item = WEAPON_ITEMS[key];
    setWeaponStock(key, qty);
    return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("✅ تم تعيين الستوك").addFields({ name: `${item.emoji} ${item.name}`, value: `${qty.toLocaleString()} حبة`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wadmin_add_res") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const iban     = interaction.fields.getTextInputValue("iban").trim();
    const resInput = interaction.fields.getTextInputValue("res_key").trim();
    const qty      = parseInt(interaction.fields.getTextInputValue("qty"));
    if (isNaN(qty) || qty < 1) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    const key = findResourceKey(resInput);
    if (!key) return interaction.reply({ content: `❌ مورد غير معروف: **${resInput}**`, ephemeral: true });
    const acc = getAccountById(iban);
    if (!acc) return interaction.reply({ content: `❌ لم يُعثر على حساب برقم **${iban}**.`, ephemeral: true });
    const item = WEAPON_ITEMS[key];
    addResources(iban, key, qty);
    return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("✅ تمت الإضافة").addFields({ name: "الحساب", value: `#${iban} — ${acc.name}`, inline: true }, { name: "المورد", value: `${item.emoji} ${item.name}`, inline: true }, { name: "الكمية", value: `+${qty}`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wadmin_remove_res") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const iban     = interaction.fields.getTextInputValue("iban").trim();
    const resInput = interaction.fields.getTextInputValue("res_key").trim();
    const qty      = parseInt(interaction.fields.getTextInputValue("qty"));
    if (isNaN(qty) || qty < 1) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    const key = findResourceKey(resInput);
    if (!key) return interaction.reply({ content: `❌ مورد غير معروف: **${resInput}**`, ephemeral: true });
    const acc = getAccountById(iban);
    if (!acc) return interaction.reply({ content: `❌ لم يُعثر على حساب برقم **${iban}**.`, ephemeral: true });
    const item = WEAPON_ITEMS[key];
    const result = removeResources(iban, key, qty);
    if (!result.success) return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("❌ فشل السحب").setDescription(result.error!)], ephemeral: true });
    return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("✅ تم السحب").addFields({ name: "الحساب", value: `#${iban} — ${acc.name}`, inline: true }, { name: "المورد", value: `${item.emoji} ${item.name}`, inline: true }, { name: "الكمية", value: `-${qty}`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wadmin_view_inv") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const iban = interaction.fields.getTextInputValue("iban").trim();
    const acc  = getAccountById(iban);
    if (!acc) return interaction.reply({ content: `❌ لم يُعثر على حساب برقم **${iban}**.`, ephemeral: true });
    const inv = acc.inventory ?? {};
    const lines = Object.entries(WEAPON_ITEMS).map(([k, v]) => `${v.emoji} **${v.name}**: ${(inv[k] ?? 0).toLocaleString()} حبة`).join("\n");
    return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle(`🗄️ مخزون #${iban} — ${acc.name}`).setDescription(lines).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wtransfer_weapon") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const weaponInput = interaction.fields.getTextInputValue("weapon_key").trim();
    const qty         = parseInt(interaction.fields.getTextInputValue("qty"));
    const toIban      = interaction.fields.getTextInputValue("to_iban").trim();
    const pinIn       = interaction.fields.getTextInputValue("pin").trim();
    if (isNaN(qty) || qty < 1) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    if (pinIn !== account.pin) return interaction.reply({ content: "❌ رمز PIN غير صحيح.", ephemeral: true });
    const weaponKey = Object.keys(CRAFTABLE_WEAPONS).find(k => k === weaponInput || CRAFTABLE_WEAPONS[k].name === weaponInput);
    if (!weaponKey) return interaction.reply({ content: `❌ السلاح غير موجود: **${weaponInput}**`, ephemeral: true });
    const toAcc = getAccountById(toIban);
    if (!toAcc) return interaction.reply({ content: `❌ لم يُعثر على حساب برقم **${toIban}**.`, ephemeral: true });
    if (toAcc.id === account.id) return interaction.reply({ content: "❌ لا تستطيع التحويل لنفسك.", ephemeral: true });
    const db = getDB();
    const fromAccDb = db.accounts[account.id];
    const current = (fromAccDb?.craftedWeapons ?? {})[weaponKey] ?? 0;
    if (current < qty) return interaction.reply({ content: `❌ تملك **${current}** فقط من هذا السلاح.`, ephemeral: true });
    if (!fromAccDb.craftedWeapons) fromAccDb.craftedWeapons = {};
    fromAccDb.craftedWeapons[weaponKey] = current - qty;
    const toAccDb = db.accounts[toAcc.id];
    if (!toAccDb.craftedWeapons) toAccDb.craftedWeapons = {};
    toAccDb.craftedWeapons[weaponKey] = (toAccDb.craftedWeapons[weaponKey] ?? 0) + qty;
    const w = CRAFTABLE_WEAPONS[weaponKey];
    const recipient = await client.users.fetch(toAcc.userId).catch(() => null);
    if (recipient) {
      await recipient.send({ embeds: [embed(DARK_BLUE).setTitle("📤 وصلك سلاح!").addFields({ name: "السلاح", value: `🔫 ${w.name}`, inline: true }, { name: "الكمية", value: `+${qty}`, inline: true }, { name: "من", value: `<@${user.id}>`, inline: true }).setTimestamp()] }).catch(() => {});
    }
    const logChannelId = (getDB().settings as any).weaponTransferLogChannelId;
    if (logChannelId) {
      const logCh = await client.channels.fetch(logChannelId).catch(() => null);
      if (logCh && logCh.isTextBased()) {
        await (logCh as any).send({ embeds: [embed(DARK_BLUE).setTitle("🔫 تحويل سلاح").addFields({ name: "المرسِل", value: `<@${user.id}> (#${account.id})`, inline: true }, { name: "المستلم", value: `<@${toAcc.userId}> (#${toIban})`, inline: true }, { name: "السلاح", value: `🔫 ${w.name}`, inline: false }, { name: "الكمية", value: `${qty}`, inline: true }).setTimestamp()] }).catch(() => {});
      }
    }
    return interaction.reply({ embeds: [embed(GREEN).setTitle("✅ تم تحويل السلاح").addFields({ name: "السلاح", value: `🔫 ${w.name}`, inline: true }, { name: "الكمية", value: `${qty}`, inline: true }, { name: "إلى", value: `<@${toAcc.userId}> (#${toIban})`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wadmin_view_weapons") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const rawUserId = interaction.fields.getTextInputValue("user_id").trim();
    const targetUserId = rawUserId.replace(/[<@!>]/g, "");
    const acc = getAccountByUserId(targetUserId);
    if (!acc) return interaction.reply({ content: `❌ لم يُعثر على حساب لهذا المستخدم.`, ephemeral: true });
    const db = getDB();
    const owned = (db.accounts[acc.id]?.craftedWeapons ?? {}) as Record<string, number>;
    const lines = Object.entries(CRAFTABLE_WEAPONS)
      .map(([k, w]) => {
        const qty = owned[k] ?? 0;
        return `🔫 **${w.name}**: ${qty > 0 ? `**${qty}** سلاح` : "—"}`;
      })
      .join("\n");
    return interaction.reply({
      embeds: [embed(DARK_BLUE)
        .setTitle(`🔫 أسلحة <@${targetUserId}> — ${acc.name}`)
        .setDescription(lines || "لا يوجد أسلحة")
        .setTimestamp()],
      ephemeral: true,
    });
  }

  if (customId === "modal_wadmin_give_weapon") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const rawUserId  = interaction.fields.getTextInputValue("user_id").trim();
    const weaponInput = interaction.fields.getTextInputValue("weapon_key").trim();
    const qty         = parseInt(interaction.fields.getTextInputValue("qty"));
    const targetUserId = rawUserId.replace(/[<@!>]/g, "");
    if (isNaN(qty) || qty < 1) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    const weaponKey = Object.keys(CRAFTABLE_WEAPONS).find(k => k === weaponInput || CRAFTABLE_WEAPONS[k].name === weaponInput);
    if (!weaponKey) return interaction.reply({ content: `❌ السلاح غير موجود: **${weaponInput}**\nتأكد من الاسم أو المفتاح.`, ephemeral: true });
    const acc = getAccountByUserId(targetUserId);
    if (!acc) return interaction.reply({ content: `❌ لم يُعثر على حساب لهذا المستخدم.`, ephemeral: true });
    const db = getDB();
    const targetAcc = db.accounts[acc.id];
    if (!targetAcc.craftedWeapons) targetAcc.craftedWeapons = {};
    targetAcc.craftedWeapons[weaponKey] = (targetAcc.craftedWeapons[weaponKey] ?? 0) + qty;
    const w = CRAFTABLE_WEAPONS[weaponKey];
    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    if (targetUser) await targetUser.send({ embeds: [embed(DARK_BLUE).setTitle("🎁 وصلك سلاح!").addFields({ name: "السلاح", value: `🔫 ${w.name}`, inline: true }, { name: "الكمية", value: `+${qty}`, inline: true }).setTimestamp()] }).catch(() => {});
    return interaction.reply({ embeds: [embed(GREEN).setTitle("✅ تم إعطاء السلاح").addFields({ name: "المستخدم", value: `<@${targetUserId}>`, inline: true }, { name: "السلاح", value: `🔫 ${w.name}`, inline: true }, { name: "الكمية", value: `+${qty}`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wadmin_take_weapon") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const rawUserId   = interaction.fields.getTextInputValue("user_id").trim();
    const weaponInput = interaction.fields.getTextInputValue("weapon_key").trim();
    const qty         = parseInt(interaction.fields.getTextInputValue("qty"));
    const targetUserId = rawUserId.replace(/[<@!>]/g, "");
    if (isNaN(qty) || qty < 1) return interaction.reply({ content: "❌ الكمية غير صحيحة.", ephemeral: true });
    const weaponKey = Object.keys(CRAFTABLE_WEAPONS).find(k => k === weaponInput || CRAFTABLE_WEAPONS[k].name === weaponInput);
    if (!weaponKey) return interaction.reply({ content: `❌ السلاح غير موجود: **${weaponInput}**\nتأكد من الاسم أو المفتاح.`, ephemeral: true });
    const acc = getAccountByUserId(targetUserId);
    if (!acc) return interaction.reply({ content: `❌ لم يُعثر على حساب لهذا المستخدم.`, ephemeral: true });
    const db = getDB();
    const targetAcc = db.accounts[acc.id];
    const current = (targetAcc.craftedWeapons ?? {})[weaponKey] ?? 0;
    if (current < qty) return interaction.reply({ content: `❌ المستخدم يملك **${current}** فقط من هذا السلاح.`, ephemeral: true });
    if (!targetAcc.craftedWeapons) targetAcc.craftedWeapons = {};
    targetAcc.craftedWeapons[weaponKey] = current - qty;
    const w = CRAFTABLE_WEAPONS[weaponKey];
    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    if (targetUser) await targetUser.send({ embeds: [embed(RED).setTitle("🔻 تم سحب سلاح منك").addFields({ name: "السلاح", value: `🔫 ${w.name}`, inline: true }, { name: "الكمية", value: `-${qty}`, inline: true }).setTimestamp()] }).catch(() => {});
    return interaction.reply({ embeds: [embed(RED).setTitle("✅ تم سحب السلاح").addFields({ name: "المستخدم", value: `<@${targetUserId}>`, inline: true }, { name: "السلاح", value: `🔫 ${w.name}`, inline: true }, { name: "الكمية", value: `-${qty}`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wadmin_transfer_log") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const channelId = interaction.fields.getTextInputValue("channel_id").trim();
    updateSettings({ weaponTransferLogChannelId: channelId } as any);
    return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("✅ تم حفظ قناة لوق تحويل الأسلحة").addFields({ name: "القناة", value: `<#${channelId}>`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_wadmin_activation_log") {
    const m = member as GuildMember;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const channelId = interaction.fields.getTextInputValue("channel_id").trim();
    updateSettings({ weaponActivationLogChannelId: channelId });
    return interaction.reply({ embeds: [embed(DARK_BLUE).setTitle("✅ تم حفظ قناة لوق التفعيل").addFields({ name: "القناة", value: `<#${channelId}>`, inline: true }).setTimestamp()], ephemeral: true });
  }

  if (customId === "modal_delete_account") {
    const m = member as GuildMember;
    if (!isAdmin(m))
      return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const accountId = interaction.fields.getTextInputValue("account_id").trim();
    const account = getAccountById(accountId);
    if (!account) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE).setTitle("❌ الحساب غير موجود").setDescription(`لم يُعثر على حساب برقم **${accountId}**`)],
        ephemeral: true,
      });
    }
    const result = deleteAccount(accountId, user.id);
    if (!result.success) {
      return interaction.reply({
        embeds: [embed(DARK_BLUE).setTitle("❌ فشل الحذف").setDescription(result.error ?? "خطأ غير معروف")],
        ephemeral: true,
      });
    }
    const db = getDB();
    const logEmbed = embed(DARK_BLUE)
      .setTitle("🗑️ تم حذف حساب بنكي")
      .addFields(
        { name: "رقم الحساب", value: `**${accountId}**`, inline: true },
        { name: "الاسم", value: account.name, inline: true },
        { name: "روبلوكس", value: account.robloxUsername || "—", inline: true },
        { name: "المستخدم", value: `<@${account.userId}>`, inline: true },
        { name: "💵 كاش كان", value: `${(account.cash ?? 0).toLocaleString()} ريال`, inline: true },
        { name: "🏦 بنك كان", value: `${account.balance.toLocaleString()} ريال`, inline: true },
        { name: "حُذف بواسطة", value: `<@${user.id}>`, inline: true },
      )
      .setTimestamp();
    if (db.settings.deleteLogChannelId) {
      const logCh = client.channels.cache.get(db.settings.deleteLogChannelId) as TextChannel;
      if (logCh) await logCh.send({ embeds: [logEmbed] }).catch(() => {});
    }
    return interaction.reply({
      content: `✅ تم حذف الحساب **#${accountId}** (${account.name}) بنجاح.`,
      ephemeral: true,
    });
  }
}

// ─── Start Bot ────────────────────────────────
export async function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("❌ DISCORD_BOT_TOKEN غير موجود!");
    return;
  }
  await client.login(token);
}
