import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActivityType
} from "discord.js";
import cron from "node-cron";

import {
  getDB,
  createAccount,
  getAccountByUserId,
  getAccountById,
  transfer,
  freezeAccount,
  getTransactions,
  addPendingRequest,
  removePendingRequest,
  updateSettings,
  getAllAccounts,
  setAccountBalance,
  removeBalance,
  deposit,
  withdraw,
  changeAccountId,
  bulkAddBalance,
  bulkRemoveBalance,
  payRoleSalaries
} from "./database.js";

// ============================================================
// 🎨 الألوان
// ============================================================
const DARK_BLUE = 0x1A1ADE;
const GREEN = 0x2E7D32;
const RED = 0xB71C1C;
const ORANGE = 0xE65100;

// ============================================================
// 👑 رتبة الأدمن — غيّر الـ ID حسب سيرفرك
// ============================================================
const ADMIN_ROLE_ID = "1515771920174551051";

// ============================================================
// 💰 رواتب الرتب — أضف أو عدّل حسب رتب سيرفرك
// ============================================================
const ROLE_SALARIES = {
  // وزارة الداخلية
  "1346802020316610582": { amount: 1500,  name: "داخلية - رتبة 1"  },
  "1388219474544562316": { amount: 1700,  name: "داخلية - رتبة 2"  },
  "1346802551168696320": { amount: 2000,  name: "داخلية - رتبة 3"  },
  "1346802626188017695": { amount: 2500,  name: "داخلية - رتبة 4"  },
  "1346802701849202710": { amount: 3000,  name: "داخلية - رتبة 5"  },
  "1346802795751280640": { amount: 3500,  name: "داخلية - رتبة 6"  },
  "1346802916354428928": { amount: 4500,  name: "داخلية - رتبة 7"  },
  "1346803009090486383": { amount: 6000,  name: "داخلية - رتبة 8"  },
  "1346803109417975818": { amount: 7000,  name: "داخلية - رتبة 9"  },
  "1346804981629456424": { amount: 9000,  name: "داخلية - رتبة 10"  },
  "1346805141226918002": { amount: 12000, name: "داخلية - رتبة 11" },
  "1346805364083003392": { amount: 15000, name: "داخلية - رتبة 12" },
  "1346805455887929377": { amount: 18000, name: "داخلية - رتبة 13" },
  "1346805531842711614": { amount: 21000, name: "داخلية - رتبة 14" },
  "1346805633084821504": { amount: 25000, name: "داخلية - رتبة 15" },
  "1346805810914660446": { amount: 30000, name: "داخلية - رتبة 16" },
  "1346805718237581332": { amount: 35000, name: "داخلية - رتبة 17" },
  // وزارة العدل
  "1346798288195813436": { amount: 6000,  name: "عدل - رتبة 1" },
  "1346798396567982110": { amount: 9000,  name: "عدل - رتبة 2" },
  "1346798525710598206": { amount: 20000, name: "عدل - رتبة 3" },
  "1346798520908124263": { amount: 30000, name: "عدل - رتبة 4" },
  // وزارة الصحة
  "1346796797292707891": { amount: 5000,  name: "صحة - رتبة 1" },
  "1346796984207671367": { amount: 5000,  name: "صحة - رتبة 2" },
  "1346796984337436674": { amount: 5000,  name: "صحة - رتبة 3" },
  "1346797332410404914": { amount: 15000, name: "صحة - رتبة 4" },
  "1346797328337731595": { amount: 20000, name: "صحة - رتبة 5" },
  // الصحافة
  "1346794635632054305": { amount: 6000,  name: "صحافة" },
  // هيئة النقل
  "1346794954999205908": { amount: 4000,  name: "هيئة النقل" },
  // أجرة / تاكسي
  "1346794198577315902": { amount: 4000,  name: "أجرة (Taxi)" },
  // مدني
  "1346794021200203776": { amount: 1000,  name: "مدني" }
};

// ============================================================
// 🔧 دوال مساعدة
// ============================================================
function getHighestSalaryForMember(roleIds) {
  let best = null;
  for (const roleId of roleIds) {
    const salary = ROLE_SALARIES[roleId];
    if (salary && (!best || salary.amount > best.amount)) {
      best = salary;
    }
  }
  return best;
}

function canPaySalary() {
  const db = getDB();
  const last = db.settings.lastSalaryPaid;
  if (!last) return { ok: true };
  const diff = Date.now() - new Date(last).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const remaining = 7 - days;
  if (remaining > 0) return { ok: false, remaining };
  return { ok: true };
}

function isAdmin(member) {
  if (!member) return false;
  return member.roles.cache.has(ADMIN_ROLE_ID);
}

function getLogoUrl() {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}/public/logo.webp`;
  return "";
}

function embed(color) {
  const e = new EmbedBuilder().setColor(color);
  const logo = getLogoUrl();
  if (logo) e.setThumbnail(logo);
  return e;
}

// ============================================================
// 🤖 إعداد البوت
// ============================================================
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ============================================================
// 📋 الأوامر (Slash Commands)
// ============================================================
const commands = [
  new SlashCommandBuilder().setName("panel").setDescription("عرض لوحة التحكم الرئيسية للبنك"),
  new SlashCommandBuilder().setName("admin").setDescription("لوحة إدارة النظام - للمسؤولين فقط"),
  new SlashCommandBuilder().setName("حساب").setDescription("عرض معلومات حسابك الشخصي"),
  new SlashCommandBuilder().setName("رصيد").setDescription("التحقق من رصيدك الحالي"),
  new SlashCommandBuilder().setName("سجلات").setDescription("عرض آخر معاملاتك"),
  new SlashCommandBuilder()
    .setName("تحويل")
    .setDescription("تحويل مبلغ لحساب آخر")
    .addStringOption((opt) =>
      opt.setName("رقم_الحساب").setDescription("رقم الحساب المستلم").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("المبلغ").setDescription("المبلغ المراد تحويله").setRequired(true).setMinValue(1)
    )
    .addStringOption((opt) =>
      opt.setName("pin").setDescription("رمز PIN الخاص بك (4 أرقام)").setRequired(true)
    )
].map((c) => c.toJSON());

async function registerCommands(token, clientId) {
  const rest = new REST({ version: "10" }).setToken(token);
  const guilds = client.guilds.cache.map((g) => g.id);
  if (guilds.length === 0) {
    console.warn("⚠️ البوت ليس في أي سيرفر بعد");
    return;
  }
  for (const guildId of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ تم تسجيل الأوامر في السيرفر: ${guildId}`);
    } catch (err) {
      console.error(`❌ خطأ في السيرفر ${guildId}:`, err);
    }
  }
}

// ============================================================
// 🕐 المهام التلقائية (Cron Jobs)
// ============================================================
function setupCronJobs() {
  // صرف الرواتب كل يوم خميس الساعة 12 ظهراً (توقيت السعودية)
  cron.schedule("0 12 * * 4", async () => {
    const db = getDB();
    if (!db.settings.salaryChannelId) return;
    const channel = client.channels.cache.get(db.settings.salaryChannelId);
    if (!channel) return;

    const check = canPaySalary();
    if (!check.ok) {
      await channel.send({ embeds: [embed(ORANGE).setTitle("⚠️ تم تخطي صرف الرواتب").setDescription(`تم الصرف مسبقاً — تبقى **${check.remaining} يوم** قبل الصرف القادم.`)] });
      return;
    }

    const salaryList = [];
    for (const [, guild] of client.guilds.cache) {
      const members = await guild.members.fetch().catch(() => null);
      if (!members) continue;
      for (const [, gm] of members) {
        if (gm.user.bot) continue;
        const roleIds = gm.roles.cache.map((r) => r.id);
        const best = getHighestSalaryForMember(roleIds);
        if (best) salaryList.push({ userId: gm.user.id, amount: best.amount, roleName: best.name });
      }
    }

    const result = payRoleSalaries(salaryList, "auto-cron");
    const e = embed(GREEN)
      .setTitle("💰 تم صرف الرواتب التلقائي")
      .setDescription("**يوم الخميس — صرف الرواتب الأسبوعي حسب الرتب**")
      .addFields(
        { name: "عدد الموظفين", value: `${result.count}`, inline: true },
        { name: "إجمالي المبلغ", value: `${result.paid.toLocaleString()} ريال`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: "نظام الرواتب التلقائي" });
    await channel.send({ embeds: [e] });
  }, { timezone: "Asia/Riyadh" });
}

// ============================================================
// 🏦 لوحة البنك الرئيسية
// ============================================================
async function sendMainPanel(channel) {
  const e = embed(DARK_BLUE)
    .setTitle("🏦 نظام إدارة الحسابات البنكية")
    .setDescription("اختر من القائمة أدناه ما تريد القيام به")
    .addFields(
      { name: "👤 إنشاء حساب", value: "فتح حساب جديد في النظام", inline: true },
      { name: "💳 حسابي", value: "عرض رصيدك ومعلومات حسابك", inline: true },
      { name: "💸 تحويل", value: "تحويل مبلغ لحساب آخر", inline: true },
      { name: "📋 السجلات", value: "عرض آخر معاملاتك", inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "نظام البنك | جميع المعاملات مسجّلة | © FTRP  — ALL RIGHTS RESERVED ." });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("main_menu")
    .setPlaceholder("📋 اختر ما تريد...")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("فتح حساب").setValue("open_account").setDescription("فتح حساب جديد في النظام").setEmoji("👤"),
      new StringSelectMenuOptionBuilder().setLabel("حسابي").setValue("my_account").setDescription("عرض رصيدك ومعلومات حسابك").setEmoji("💳"),
      new StringSelectMenuOptionBuilder().setLabel("إيداع كاش ← بنك").setValue("deposit_btn").setDescription("تحويل كاش إلى رصيد بنكي").setEmoji("🏦"),
      new StringSelectMenuOptionBuilder().setLabel("سحب بنك ← كاش").setValue("withdraw_btn").setDescription("تحويل رصيد بنكي إلى كاش").setEmoji("💵"),
      new StringSelectMenuOptionBuilder().setLabel("تحويل أموال").setValue("transfer_btn").setDescription("تحويل مبلغ لحساب آخر").setEmoji("💸"),
      new StringSelectMenuOptionBuilder().setLabel("سجل المعاملات").setValue("my_transactions").setDescription("عرض آخر معاملاتك").setEmoji("📋"),
      new StringSelectMenuOptionBuilder().setLabel("لوحة الإدارة").setValue("admin_panel").setDescription("للمسؤولين فقط").setEmoji("🔧")
    );

  const row = new ActionRowBuilder().addComponents(menu);
  await channel.send({ embeds: [e], components: [row] });
}

// ============================================================
// 🔧 لوحة الأدمن
// ============================================================
async function sendAdminPanel(channel) {
  const e = embed(DARK_BLUE)
    .setTitle("🔧 لوحة إدارة النظام")
    .setDescription("أدوات الإدارة — للمسؤولين فقط")
    .addFields(
      { name: "❄️ تجميد حساب", value: "تجميد أو رفع تجميد حساب", inline: true },
      { name: "💰 صرف الرواتب", value: "صرف رواتب جميع الموظفين حسب الرتبة", inline: true },
      { name: "📊 جميع الحسابات", value: "عرض قائمة الحسابات", inline: true },
      { name: "➕ إضافة مال", value: "إضافة مبلغ لحساب معين", inline: true },
      { name: "➖ إزالة مال", value: "خصم مبلغ من حساب معين", inline: true },
      { name: "📜 كل السجلات", value: "عرض آخر المعاملات", inline: true },
      { name: "⚙️ الإعدادات", value: "ضبط قنوات الرواتب والطلبات", inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "لوحة الإدارة" });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("admin_menu")
    .setPlaceholder("🔧 اختر إجراءً إدارياً...")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("تجميد / رفع تجميد حساب").setValue("admin_freeze").setDescription("تجميد أو رفع التجميد عن حساب").setEmoji("❄️"),
      new StringSelectMenuOptionBuilder().setLabel("صرف الرواتب").setValue("admin_pay_salary").setDescription("صرف رواتب الموظفين حسب الرتبة").setEmoji("💰"),
      new StringSelectMenuOptionBuilder().setLabel("جميع الحسابات").setValue("admin_all_accounts").setDescription("عرض قائمة بكل الحسابات").setEmoji("📊"),
      new StringSelectMenuOptionBuilder().setLabel("إضافة مال لحساب").setValue("admin_add_balance").setDescription("إضافة مبلغ لحساب معين").setEmoji("➕"),
      new StringSelectMenuOptionBuilder().setLabel("إزالة مال من حساب").setValue("admin_remove_balance").setDescription("خصم مبلغ من حساب معين").setEmoji("➖"),
      new StringSelectMenuOptionBuilder().setLabel("إضافة للجميع").setValue("admin_bulk_add").setDescription("إضافة مبلغ أو نسبة لجميع الحسابات").setEmoji("➕"),
      new StringSelectMenuOptionBuilder().setLabel("إزالة من الجميع").setValue("admin_bulk_remove").setDescription("خصم مبلغ أو نسبة من جميع الحسابات").setEmoji("➖"),
      new StringSelectMenuOptionBuilder().setLabel("تغيير الإيبان").setValue("admin_change_iban").setDescription("تغيير رقم حساب لإيبان جديد").setEmoji("🔢"),
      new StringSelectMenuOptionBuilder().setLabel("كل السجلات").setValue("admin_all_transactions").setDescription("عرض آخر المعاملات في النظام").setEmoji("📜"),
      new StringSelectMenuOptionBuilder().setLabel("الإعدادات").setValue("admin_settings").setDescription("ضبط قنوات الرواتب والطلبات").setEmoji("⚙️")
    );

  const row = new ActionRowBuilder().addComponents(menu);
  await channel.send({ embeds: [e], components: [row] });
}

// ============================================================
// 🖱️ معالج الأزرار والقوائم
// ============================================================
async function handleButton(interaction) {
  const { customId, user, guild, member, channel } = interaction;

  // فتح حساب
  if (customId === "open_account") {
    if (getAccountByUserId(user.id))
      return interaction.reply({ content: "❌ لديك حساب بالفعل!", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_open_account").setTitle("🏦 فتح حساب جديد");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("name").setLabel("الاسم الكامل").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("age").setLabel("العمر").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("عمر الشخصية داخل الرول البلاي")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("pin").setLabel("رمز PIN (4 أرقام)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(4).setPlaceholder("****")
      )
    );
    return interaction.showModal(modal);
  }

  // عرض الحساب
  if (customId === "my_account") {
    const account = getAccountByUserId(user.id);
    if (!account)
      return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const c = account.cash ?? 0;
    const total = account.balance + c;
    const e = embed(account.frozen ? RED : DARK_BLUE)
      .setTitle("💳 معلومات حسابك")
      .addFields(
        { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
        { name: "💵 كاش", value: `**${c.toLocaleString()} ريال**`, inline: true },
        { name: "🏦 رصيد البنك", value: `**${account.balance.toLocaleString()} ريال**`, inline: true },
        { name: "💰 الإجمالي", value: `**${total.toLocaleString()} ريال**`, inline: true },
        { name: "الراتب الأسبوعي", value: `**${account.salary.toLocaleString()} ريال**`, inline: true },
        { name: "الحالة", value: account.frozen ? "🔴 مجمَّد" : "🟢 نشط", inline: true }
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  // إيداع كاش إلى بنك
  if (customId === "deposit_btn") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (account.frozen) return interaction.reply({ content: "❌ حسابك مجمَّد.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_deposit").setTitle("🏦 إيداع كاش إلى البنك");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("amount").setLabel("المبلغ").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب المبلغ المطلوب إيداعه")
      )
    );
    return interaction.showModal(modal);
  }

  // سحب من بنك إلى كاش
  if (customId === "withdraw_btn") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (account.frozen) return interaction.reply({ content: "❌ حسابك مجمَّد.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_withdraw").setTitle("💵 سحب من البنك إلى الكاش");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("amount").setLabel("المبلغ").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب المبلغ المطلوب سحبه")
      )
    );
    return interaction.showModal(modal);
  }

  // تحويل
  if (customId === "transfer_btn") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (account.frozen) return interaction.reply({ content: "❌ حسابك مجمَّد لا يمكنك التحويل.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_transfer").setTitle("💸 تحويل أموال");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("to_account").setLabel("رقم الحساب المستلم").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب رقم الإيبان الخاص بالشخص المراد التحويل إليه")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("amount").setLabel("المبلغ").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب المبلغ المراد تحويله")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("pin").setLabel("رمز PIN الخاص بك (4 أرقام)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(4).setPlaceholder("****")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel("سبب التحويل (اختياري)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("مثال: دفع إيجار، هدية...")
      )
    );
    return interaction.showModal(modal);
  }

  // سجلاتي
  if (customId === "my_transactions") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const txs = getTransactions(account.id, 10);
    const e = embed(DARK_BLUE)
      .setTitle("📋 آخر معاملاتك")
      .setDescription(
        txs.length === 0
          ? "لا توجد معاملات بعد."
          : txs.map((t) => `• ${t.description}\n🕒 ${new Date(t.timestamp).toLocaleString("ar-SA")}`).join("\n\n")
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  // لوحة الأدمن
  if (customId === "admin_panel") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية للإدارة.", ephemeral: true });
    await sendAdminPanel(channel);
    return interaction.reply({ content: "✅ تم فتح لوحة الإدارة.", ephemeral: true });
  }

  // ===== إجراءات الأدمن =====
  if (customId === "admin_freeze") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_freeze").setTitle("تجميد / الغاء تجميد حساب");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("account_id").setLabel("رقم الحساب").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب رقم الإيبان الخاص بالشخص المراد تجميده")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("action").setLabel('الإجراء: اكتب "تجميد" أو "الغاء"').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("تجميد أو الغاء")
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_pay_salary") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("confirm_pay_salary").setLabel("تأكيد صرف الرواتب").setStyle(ButtonStyle.Success).setEmoji("✅"),
      new ButtonBuilder().setCustomId("cancel_action").setLabel("إلغاء").setStyle(ButtonStyle.Secondary).setEmoji("❌")
    );
    return interaction.reply({
      embeds: [embed(ORANGE).setTitle("⚠️ تأكيد صرف الرواتب").setDescription("هل تريد صرف رواتب جميع الموظفين الآن؟")],
      components: [row],
      ephemeral: true
    });
  }

  if (customId === "confirm_pay_salary") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const check = canPaySalary();
    if (!check.ok) {
      return interaction.update({
        embeds: [embed(ORANGE).setTitle("⚠️ لا يمكن الصرف الآن").setDescription(`تم صرف الرواتب مسبقاً — تبقى **${check.remaining} يوم** قبل أن يُسمح بالصرف مجدداً.`)],
        components: []
      });
    }
    await interaction.deferUpdate();
    const guildMembers = await guild.members.fetch().catch(() => null);
    const salaryList = [];
    if (guildMembers) {
      for (const [, gm] of guildMembers) {
        if (gm.user.bot) continue;
        const roleIds = gm.roles.cache.map((r) => r.id);
        const best = getHighestSalaryForMember(roleIds);
        if (best) salaryList.push({ userId: gm.user.id, amount: best.amount, roleName: best.name });
      }
    }
    const result = payRoleSalaries(salaryList, user.id);
    const db = getDB();
    const e = embed(GREEN)
      .setTitle("💰 تم صرف الرواتب بنجاح")
      .setDescription("تم الصرف حسب الرتب المحددة")
      .addFields(
        { name: "عدد الموظفين", value: `${result.count}`, inline: true },
        { name: "إجمالي المبلغ", value: `${result.paid.toLocaleString()} ريال`, inline: true },
        { name: "صرف بواسطة", value: `<@${user.id}>`, inline: true }
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [e], components: [] });
    if (db.settings.salaryChannelId) {
      const salaryChannel = client.channels.cache.get(db.settings.salaryChannelId);
      if (salaryChannel) await salaryChannel.send({ embeds: [e] });
    }
    return;
  }

  if (customId === "cancel_action") {
    return interaction.update({ embeds: [embed(RED).setTitle("❌ تم الإلغاء")], components: [] });
  }

  if (customId === "admin_all_accounts") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const accounts = getAllAccounts();
    const lines = accounts.map((acc) => {
      const c = acc.cash ?? 0;
      return `**#${acc.id}** — <@${acc.userId}>\n💵 كاش: ${c.toLocaleString()} | 🏦 بنك: ${acc.balance.toLocaleString()} | 💰 إجمالي: ${(acc.balance + c).toLocaleString()} | ${acc.frozen ? "🔴مجمَّد" : "🟢نشط"}`;
    });
    const e = embed(DARK_BLUE)
      .setTitle(`📊 جميع الحسابات (${accounts.length})`)
      .setDescription(lines.length === 0 ? "لا توجد حسابات." : lines.slice(0, 15).join("\n\n"))
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "admin_add_balance") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_add_balance").setTitle("➕ إضافة مال لحساب");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("account_id").setLabel("رقم الحساب").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("amount").setLabel("المبلغ المراد إضافته").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("target").setLabel("المحفظة (بنك / كاش)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بنك أو كاش")
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_remove_balance") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_remove_balance").setTitle("➖ إزالة مال من حساب");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("account_id").setLabel("رقم الحساب").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب إيبان الحساب المراد خصم الأموال منه")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("amount").setLabel("المبلغ المراد خصمه").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب المبلغ المراد خصمه ")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("target").setLabel("المحفظة (بنك / كاش)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بنك أو كاش")
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_change_iban") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_change_iban").setTitle("🔢 تغيير الإيبان");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("old_id").setLabel("رقم الحساب الحالي").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("new_id").setLabel("الإيبان الجديد (4 أرقام)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(4).setMaxLength(4).setPlaceholder("من اربعة ارقام فقط .")
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_bulk_add") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_bulk_add").setTitle("➕ إضافة للجميع");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("value").setLabel("المبلغ أو النسبة المئوية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب المبلغ المراد اضافته للجميع")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("mode").setLabel("النوع: مبلغ / نسبة").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مبلغ أو نسبة")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("target").setLabel("المحفظة: بنك / كاش").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بنك أو كاش")
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_bulk_remove") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_bulk_remove").setTitle("➖ إزالة من الجميع");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("value").setLabel("المبلغ أو النسبة المئوية").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("اكتب المبلغ المراد خصمه من الجميع")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("mode").setLabel("النوع: مبلغ / نسبة").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("مبلغ أو نسبة")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("target").setLabel("المحفظة: بنك / كاش").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("بنك أو كاش")
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === "admin_all_transactions") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const txs = getTransactions(undefined, 15);
    const e = embed(DARK_BLUE)
      .setTitle("📜 آخر المعاملات")
      .setDescription(
        txs.length === 0
          ? "لا توجد معاملات."
          : txs.map((t) => `• ${t.description}\n🕒 ${new Date(t.timestamp).toLocaleString("ar-SA")}`).join("\n\n")
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (customId === "admin_settings") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId("modal_settings").setTitle("إعدادات النظام");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("salary_channel").setLabel("ID قناة إعلانات الرواتب").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("اتركه فارغاً إذا لم تريد تغييره")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("request_channel").setLabel("ID قناة طلبات إنشاء الحسابات").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("اتركه فارغاً إذا لم تريد تغييره")
      )
    );
    return interaction.showModal(modal);
  }

  // قبول/رفض طلب الحساب
  if (customId.startsWith("approve_account_")) {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const reqId = customId.replace("approve_account_", "");
    const pending = removePendingRequest(reqId);
    if (!pending) return interaction.reply({ content: "❌ الطلب غير موجود أو تمت معالجته.", ephemeral: true });
    const account = createAccount(pending.userId, pending.username, pending.displayName, pending.salary ?? 0, pending.name || pending.displayName, pending.age || 0, pending.pin || "0000");
    const e = embed(GREEN)
      .setTitle("✅ تمت الموافقة على الحساب")
      .addFields(
        { name: "المستخدم", value: `<@${pending.userId}>`, inline: true },
        { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
        { name: "الراتب", value: `${account.salary.toLocaleString()} ريال`, inline: true },
        { name: "تمت الموافقة بواسطة", value: `<@${user.id}>`, inline: true }
      )
      .setTimestamp();
    await interaction.update({ embeds: [e], components: [] });
    const requestUser = await client.users.fetch(pending.userId).catch(() => null);
    if (requestUser) {
      await requestUser.send({
        embeds: [
          embed(GREEN).setTitle("✅ تمت الموافقة على حسابك").setDescription(`رقم حسابك: **${account.id}**\nيمكنك الآن استخدام جميع خدمات البنك.`).setTimestamp()
        ]
      }).catch(() => {});
    }
    return;
  }

  if (customId.startsWith("reject_account_")) {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const reqId = customId.replace("reject_account_", "");
    const pending = removePendingRequest(reqId);
    if (!pending) return interaction.reply({ content: "❌ الطلب غير موجود أو تمت معالجته.", ephemeral: true });
    const e = embed(RED)
      .setTitle("❌ تم رفض طلب الحساب")
      .addFields(
        { name: "المستخدم", value: `<@${pending.userId}>`, inline: true },
        { name: "تم الرفض بواسطة", value: `<@${user.id}>`, inline: true }
      )
      .setTimestamp();
    await interaction.update({ embeds: [e], components: [] });
    const requestUser = await client.users.fetch(pending.userId).catch(() => null);
    if (requestUser) {
      await requestUser.send({
        embeds: [embed(RED).setTitle("❌ تم رفض طلب حسابك").setDescription("تم رفض طلبك من قِبل الإدارة.").setTimestamp()]
      }).catch(() => {});
    }
    return;
  }
}

// ============================================================
// 📝 معالج النوافذ المنبثقة (Modals)
// ============================================================
async function handleModal(interaction) {
  const { customId, user, guild, member } = interaction;

  // فتح حساب
  if (customId === "modal_open_account") {
    const name = interaction.fields.getTextInputValue("name").trim();
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
      const account = createAccount(user.id, user.username, displayName, 0, name, age, pin);
      return interaction.reply({
        embeds: [
          embed(GREEN).setTitle("✅ تم إنشاء حسابك بنجاح").addFields(
            { name: "الاسم", value: name, inline: true },
            { name: "رقم الحساب (إيبان)", value: `**${account.id}**`, inline: true },
            { name: "رمز PIN", value: "🔒 تم الحفظ بأمان", inline: true }
          ).setTimestamp()
        ],
        ephemeral: true
      });
    }
    addPendingRequest({ id: reqId, userId: user.id, username: user.username, displayName, name, age, pin, requestedAt: new Date().toISOString(), channelId: db.settings.requestChannelId, salary: 0 });
    const requestChannel = guild.channels.cache.get(db.settings.requestChannelId);
    if (requestChannel) {
      const e = embed(ORANGE).setTitle("📝 طلب إنشاء حساب جديد")
        .addFields(
          { name: "المستخدم ( اليوزر )", value: `<@${user.id}> (${displayName})`, inline: true },
          { name: "الاسم ( رول بلاي )", value: name, inline: true },
          { name: "العمر ( رول بلاي )", value: `${age}`, inline: true },
          { name: "وقت الطلب", value: new Date().toLocaleString("ar-SA"), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `معرف الطلب: ${reqId}` });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_account_${reqId}`).setLabel("قبول").setStyle(ButtonStyle.Success).setEmoji("✅"),
        new ButtonBuilder().setCustomId(`reject_account_${reqId}`).setLabel("رفض").setStyle(ButtonStyle.Danger).setEmoji("❌")
      );
      await requestChannel.send({ embeds: [e], components: [row] });
    }
    return interaction.reply({
      embeds: [embed(DARK_BLUE).setTitle("⏳ تم إرسال طلبك").setDescription("تم إرسال طلب فتح الحساب للإدارة. سيتم إشعارك بالنتيجة قريباً.").setTimestamp()],
      ephemeral: true
    });
  }

  // تحويل
  if (customId === "modal_transfer") {
    const toAccountId = interaction.fields.getTextInputValue("to_account").trim();
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    const pinInput = interaction.fields.getTextInputValue("pin").trim();
    const reason = interaction.fields.getTextInputValue("reason").trim();
    if (isNaN(amount) || amount <= 0) return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const fromAccount = getAccountByUserId(user.id);
    if (!fromAccount) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (pinInput !== fromAccount.pin) return interaction.reply({ content: "❌ رمز PIN غير صحيح، تم إلغاء التحويل.", ephemeral: true });
    const result = transfer(fromAccount.id, toAccountId, amount, user.id);
    if (!result.success) return interaction.reply({ embeds: [embed(RED).setTitle("❌ فشل التحويل").setDescription(result.error)], ephemeral: true });
    const updatedFrom = getAccountById(fromAccount.id);
    const toAcct = getAccountById(toAccountId);
    if (toAcct) {
      const recipient = await client.users.fetch(toAcct.userId).catch(() => null);
      if (recipient) {
        const receivedEmbed = embed(GREEN).setTitle("💸 وصلك تحويل!").addFields(
          { name: "من", value: `<@${user.id}>`, inline: true },
          { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
          { name: "رصيدك الجديد", value: `${toAcct.balance.toLocaleString()} ريال`, inline: true }
        );
        if (reason) receivedEmbed.addFields({ name: "السبب", value: reason, inline: false });
        receivedEmbed.setTimestamp();
        await recipient.send({ embeds: [receivedEmbed] }).catch(() => {});
      }
    }
    const sentEmbed = embed(GREEN).setTitle("✅ تم التحويل بنجاح").addFields(
      { name: "من حساب", value: `**${fromAccount.id}**`, inline: true },
      { name: "إلى حساب", value: `**${toAccountId}**`, inline: true },
      { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
      { name: "رصيدك الجديد", value: `${updatedFrom?.balance.toLocaleString()} ريال`, inline: true }
    );
    if (reason) sentEmbed.addFields({ name: "السبب", value: reason, inline: false });
    sentEmbed.setTimestamp();
    return interaction.reply({ embeds: [sentEmbed], ephemeral: true });
  }

  // تجميد
  if (customId === "modal_freeze") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const accountId = interaction.fields.getTextInputValue("account_id").trim();
    const action = interaction.fields.getTextInputValue("action").trim();
    const doFreeze = action === "تجميد";
    const account = getAccountById(accountId);
    if (!account) return interaction.reply({ content: "❌ الحساب غير موجود.", ephemeral: true });
    freezeAccount(accountId, doFreeze, user.id);
    return interaction.reply({
      embeds: [embed(doFreeze ? RED : GREEN).setTitle(doFreeze ? "❄️ تم تجميد الحساب" : "✅ تم رفع التجميد").addFields(
        { name: "رقم الحساب", value: `**${accountId}**`, inline: true },
        { name: "بواسطة", value: `<@${user.id}>`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // إضافة مال
  if (customId === "modal_add_balance") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const accountId = interaction.fields.getTextInputValue("account_id").trim();
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const target = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(amount) || amount <= 0) return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const ok = setAccountBalance(accountId, amount, user.id, target);
    if (!ok) return interaction.reply({ content: "❌ الحساب غير موجود.", ephemeral: true });
    const account = getAccountById(accountId);
    return interaction.reply({
      embeds: [embed(GREEN).setTitle("➕ تم إضافة المال").addFields(
        { name: "رقم الحساب", value: `**${accountId}**`, inline: true },
        { name: "المبلغ المضاف", value: `**${amount.toLocaleString()} ريال**`, inline: true },
        { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
        { name: "💵 كاش الآن", value: `${(account?.cash ?? 0).toLocaleString()} ريال`, inline: true },
        { name: "🏦 بنك الآن", value: `${account?.balance.toLocaleString()} ريال`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // إزالة مال
  if (customId === "modal_remove_balance") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const accountId = interaction.fields.getTextInputValue("account_id").trim();
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const target = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(amount) || amount <= 0) return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const result = removeBalance(accountId, amount, user.id, target);
    if (!result.success) return interaction.reply({ embeds: [embed(RED).setTitle("❌ فشل الخصم").setDescription(result.error)], ephemeral: true });
    const account = getAccountById(accountId);
    return interaction.reply({
      embeds: [embed(RED).setTitle("➖ تم خصم المال").addFields(
        { name: "رقم الحساب", value: `**${accountId}**`, inline: true },
        { name: "المبلغ المخصوم", value: `**${amount.toLocaleString()} ريال**`, inline: true },
        { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
        { name: "💵 كاش الآن", value: `${(account?.cash ?? 0).toLocaleString()} ريال`, inline: true },
        { name: "🏦 بنك الآن", value: `${account?.balance.toLocaleString()} ريال`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // إيداع
  if (customId === "modal_deposit") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    if (isNaN(amount) || amount <= 0) return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const result = deposit(account.id, amount, user.id);
    if (!result.success) return interaction.reply({ embeds: [embed(RED).setTitle("❌ فشل الإيداع").setDescription(result.error)], ephemeral: true });
    const updated = getAccountById(account.id);
    return interaction.reply({
      embeds: [embed(GREEN).setTitle("🏦 تم الإيداع بنجاح").addFields(
        { name: "المبلغ المودع", value: `**${amount.toLocaleString()} ريال**`, inline: true },
        { name: "💵 كاش المتبقي", value: `${(updated.cash ?? 0).toLocaleString()} ريال`, inline: true },
        { name: "🏦 رصيد البنك الجديد", value: `${updated.balance.toLocaleString()} ريال`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // سحب
  if (customId === "modal_withdraw") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const amount = parseInt(interaction.fields.getTextInputValue("amount"));
    if (isNaN(amount) || amount <= 0) return interaction.reply({ content: "❌ المبلغ غير صحيح.", ephemeral: true });
    const result = withdraw(account.id, amount, user.id);
    if (!result.success) return interaction.reply({ embeds: [embed(RED).setTitle("❌ فشل السحب").setDescription(result.error)], ephemeral: true });
    const updated = getAccountById(account.id);
    return interaction.reply({
      embeds: [embed(GREEN).setTitle("💵 تم السحب بنجاح").addFields(
        { name: "المبلغ المسحوب", value: `**${amount.toLocaleString()} ريال**`, inline: true },
        { name: "🏦 رصيد البنك الجديد", value: `${updated.balance.toLocaleString()} ريال`, inline: true },
        { name: "💵 الكاش الجديد", value: `${(updated.cash ?? 0).toLocaleString()} ريال`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // تغيير الإيبان
  if (customId === "modal_change_iban") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const oldId = interaction.fields.getTextInputValue("old_id").trim();
    const newId = interaction.fields.getTextInputValue("new_id").trim();
    const result = changeAccountId(oldId, newId, user.id);
    if (!result.success) return interaction.reply({ embeds: [embed(RED).setTitle("❌ فشل تغيير الإيبان").setDescription(result.error)], ephemeral: true });
    const account = getAccountById(newId);
    return interaction.reply({
      embeds: [embed(GREEN).setTitle("🔢 تم تغيير الإيبان").addFields(
        { name: "الإيبان القديم", value: `**${oldId}**`, inline: true },
        { name: "الإيبان الجديد", value: `**${newId}**`, inline: true },
        { name: "المستخدم", value: `<@${account?.userId}>`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // إضافة جماعية
  if (customId === "modal_bulk_add") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const value = parseFloat(interaction.fields.getTextInputValue("value"));
    const rawMode = interaction.fields.getTextInputValue("mode").trim();
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const mode = rawMode === "نسبة" ? "percent" : "amount";
    const target = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(value) || value <= 0) return interaction.reply({ content: "❌ القيمة غير صحيحة.", ephemeral: true });
    const { count, total } = bulkAddBalance(value, mode, target, user.id);
    const label = mode === "percent" ? `${value}%` : `${value.toLocaleString()} ريال`;
    return interaction.reply({
      embeds: [embed(GREEN).setTitle("➕ تمت الإضافة الجماعية").addFields(
        { name: "القيمة", value: label, inline: true },
        { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
        { name: "عدد الحسابات", value: `${count}`, inline: true },
        { name: "الإجمالي المضاف", value: `${total.toLocaleString()} ريال`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // إزالة جماعية
  if (customId === "modal_bulk_remove") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const value = parseFloat(interaction.fields.getTextInputValue("value"));
    const rawMode = interaction.fields.getTextInputValue("mode").trim();
    const rawTarget = interaction.fields.getTextInputValue("target").trim();
    const mode = rawMode === "نسبة" ? "percent" : "amount";
    const target = rawTarget === "كاش" ? "cash" : "bank";
    if (isNaN(value) || value <= 0) return interaction.reply({ content: "❌ القيمة غير صحيحة.", ephemeral: true });
    const { count, total } = bulkRemoveBalance(value, mode, target, user.id);
    const label = mode === "percent" ? `${value}%` : `${value.toLocaleString()} ريال`;
    return interaction.reply({
      embeds: [embed(RED).setTitle("➖ تم الخصم الجماعي").addFields(
        { name: "القيمة", value: label, inline: true },
        { name: "المحفظة", value: target === "cash" ? "💵 كاش" : "🏦 بنك", inline: true },
        { name: "عدد الحسابات", value: `${count}`, inline: true },
        { name: "الإجمالي المخصوم", value: `${total.toLocaleString()} ريال`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }

  // إعدادات
  if (customId === "modal_settings") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية.", ephemeral: true });
    const salaryChannel = interaction.fields.getTextInputValue("salary_channel").trim();
    const requestChannel = interaction.fields.getTextInputValue("request_channel").trim();
    const updates = {};
    if (salaryChannel) updates.salaryChannelId = salaryChannel;
    if (requestChannel) updates.requestChannelId = requestChannel;
    updateSettings(updates);
    return interaction.reply({
      embeds: [embed(GREEN).setTitle("⚙️ تم حفظ الإعدادات").addFields(
        salaryChannel ? { name: "قناة الرواتب", value: `<#${salaryChannel}>`, inline: true } : { name: "قناة الرواتب", value: "لم تتغير", inline: true },
        requestChannel ? { name: "قناة الطلبات", value: `<#${requestChannel}>`, inline: true } : { name: "قناة الطلبات", value: "لم تتغير", inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }
}

// ============================================================
// ⚡ أوامر Slash
// ============================================================
async function handleSlashCommand(interaction) {
  const { commandName, user, member, channel } = interaction;

  if (commandName === "panel") {
    await sendMainPanel(channel);
    return interaction.reply({ content: "✅ تم إرسال اللوحة.", ephemeral: true });
  }

  if (commandName === "admin") {
    const m = member;
    if (!isAdmin(m)) return interaction.reply({ content: "❌ ليس لديك صلاحية للوصول للوحة الإدارة.", ephemeral: true });
    await sendAdminPanel(channel);
    return interaction.reply({ content: "✅ تم إرسال لوحة الإدارة.", ephemeral: true });
  }

  if (commandName === "حساب" || commandName === "رصيد") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ embeds: [embed(RED).setTitle("❌ لا يوجد لديك حساب").setDescription("استخدم `/panel` ثم اضغط **فتح حساب**.")], ephemeral: true });
    const c = account.cash ?? 0;
    const total = account.balance + c;
    const e = embed(account.frozen ? RED : DARK_BLUE)
      .setTitle("💳 معلومات حسابك")
      .addFields(
        { name: "رقم الحساب", value: `**${account.id}**`, inline: true },
        { name: "💵 كاش", value: `**${c.toLocaleString()} ريال**`, inline: true },
        { name: "🏦 رصيد البنك", value: `**${account.balance.toLocaleString()} ريال**`, inline: true },
        { name: "💰 الإجمالي", value: `**${total.toLocaleString()} ريال**`, inline: true },
        { name: "الراتب الأسبوعي", value: `**${account.salary.toLocaleString()} ريال**`, inline: true },
        { name: "الحالة", value: account.frozen ? "🔴 مجمَّد" : "🟢 نشط", inline: true },
        { name: "تاريخ الإنشاء", value: new Date(account.createdAt).toLocaleDateString("ar-SA"), inline: true }
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (commandName === "سجلات") {
    const account = getAccountByUserId(user.id);
    if (!account) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    const txs = getTransactions(account.id, 10);
    const e = embed(DARK_BLUE)
      .setTitle("📋 آخر معاملاتك")
      .setDescription(
        txs.length === 0
          ? "لا توجد معاملات بعد."
          : txs.map((t) => `• ${t.description}\n🕒 ${new Date(t.timestamp).toLocaleString("ar-SA")}`).join("\n\n")
      )
      .setTimestamp();
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  if (commandName === "تحويل") {
    const toAccountId = interaction.options.getString("رقم_الحساب", true).trim();
    const amount = interaction.options.getInteger("المبلغ", true);
    const pinInput = interaction.options.getString("pin", true).trim();
    const fromAccount = getAccountByUserId(user.id);
    if (!fromAccount) return interaction.reply({ content: "❌ لا يوجد لديك حساب.", ephemeral: true });
    if (fromAccount.frozen) return interaction.reply({ content: "❌ حسابك مجمَّد.", ephemeral: true });
    if (pinInput !== fromAccount.pin) return interaction.reply({ content: "❌ رمز PIN غير صحيح.", ephemeral: true });
    const result = transfer(fromAccount.id, toAccountId, amount, user.id);
    if (!result.success) return interaction.reply({ embeds: [embed(RED).setTitle("❌ فشل التحويل").setDescription(result.error)], ephemeral: true });
    const updatedFrom = getAccountById(fromAccount.id);
    const toAccount = getAccountById(toAccountId);
    if (toAccount) {
      const recipient = await client.users.fetch(toAccount.userId).catch(() => null);
      if (recipient) {
        await recipient.send({
          embeds: [embed(GREEN).setTitle("💸 وصلك تحويل!").addFields(
            { name: "من", value: `<@${user.id}>`, inline: true },
            { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
            { name: "رصيدك الجديد", value: `${toAccount.balance.toLocaleString()} ريال`, inline: true }
          ).setTimestamp()]
        }).catch(() => {});
      }
    }
    return interaction.reply({
      embeds: [embed(GREEN).setTitle("✅ تم التحويل بنجاح").addFields(
        { name: "من حساب", value: `**${fromAccount.id}**`, inline: true },
        { name: "إلى حساب", value: `**${toAccountId}**`, inline: true },
        { name: "المبلغ", value: `**${amount.toLocaleString()} ريال**`, inline: true },
        { name: "رصيدك الجديد", value: `${updatedFrom?.balance.toLocaleString()} ريال`, inline: true }
      ).setTimestamp()],
      ephemeral: true
    });
  }
}

// ============================================================
// 🎮 الأحداث الرئيسية
// ============================================================
client.once("clientReady", async (readyClient) => {
  console.log(`✅ البوت شغّال: ${readyClient.user.tag}`);

  readyClient.user.setPresence({
    status: "online",
    activities: [{ name: "Powered By FTRP .", type: ActivityType.Playing }]
  });

  const token = process.env.DISCORD_BOT_TOKEN;
  await registerCommands(token, readyClient.user.id);
  setupCronJobs();
});

client.on("guildCreate", async (guild) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
    console.log(`✅ تم تسجيل الأوامر في السيرفر الجديد: ${guild.name}`);
  } catch (err) {
    console.error("❌ خطأ في تسجيل أوامر السيرفر الجديد:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) return handleSlashCommand(interaction);
    if (interaction.isButton()) return handleButton(interaction);
    if (interaction.isStringSelectMenu()) {
      const value = interaction.values[0];
      interaction.customId = value;
      return handleButton(interaction);
    }
    if (interaction.isModalSubmit()) return handleModal(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: "❌ حدث خطأ غير متوقع.", ephemeral: true }).catch(() => {});
    }
  }
});

// ============================================================
// 🚀 تشغيل البوت
// ============================================================
export async function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("❌ DISCORD_BOT_TOKEN غير موجود!");
    return;
  }
  await client.login(token);
}