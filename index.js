const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const CONFIG = {
  TOKEN: process.env.TOKEN,
  YETKILI_ROL_ID: process.env.YETKILI_ROL_ID,
};

const mesaiBaslangic = new Map();
const haftalikMesai = new Map();

function formatSure(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/3600)}s ${Math.floor((s%3600)/60)}dk ${s%60}sn`;
}

function mesaiPaneliOlustur() {
  const embed = new EmbedBuilder()
    .setTitle("🚔  BCSD — Mesai Paneli")
    .setDescription("```\nBlaine County Sheriff Department\nFiveM Mesai Takip Sistemi\n```\nAşağıdaki butonları kullanarak mesainizi yönetin.")
    .setColor(0x1a3a5c)
    .addFields(
      { name: "🟢  Mesai Başlat", value: "Göreve başladığınızda saatinizi kayıt altına alır.", inline: false },
      { name: "🔴  Mesai Sonlandır", value: "Görev sürenizi hesaplar ve size özel bildirir.", inline: false },
      { name: "📊  Haftalık Top", value: "Bu haftaki tüm personelin mesai toplamını listeler.", inline: false }
    )
    .setFooter({ text: "BCSD FiveM • Mesai Sistemi" })
    .setTimestamp();

  const satir = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mesai_baslat").setLabel("Mesai Başlat").setStyle(ButtonStyle.Success).setEmoji("🟢"),
    new ButtonBuilder().setCustomId("mesai_bitir").setLabel("Mesai Sonlandır").setStyle(ButtonStyle.Danger).setEmoji("🔴"),
    new ButtonBuilder().setCustomId("mesai_top").setLabel("Haftalık Top").setStyle(ButtonStyle.Primary).setEmoji("📊")
  );

  return { embeds: [embed], components: [satir] };
}

client.once("ready", async () => {
  console.log(`✅ Bot aktif: ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(CONFIG.TOKEN);
  const komutlar = [new SlashCommandBuilder().setName("mesaipanel").setDescription("BCSD mesai panelini gönderir.").toJSON()];
  await rest.put(Routes.applicationCommands(client.user.id), { body: komutlar });
  console.log("✅ Slash komutları kaydedildi.");
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "mesaipanel") {
    await interaction.channel.send(mesaiPaneliOlustur());
    return interaction.reply({ content: "✅ Panel gönderildi.", ephemeral: true });
  }

  if (!interaction.isButton()) return;

  const { customId, user, member } = interaction;
  const displayName = member?.displayName || user.username;

  if (customId === "mesai_baslat") {
    if (mesaiBaslangic.has(user.id)) {
      const b = mesaiBaslangic.get(user.id);
      return interaction.reply({ content: `⚠️ Zaten aktif mesainiz var! Başlangıç: <t:${Math.floor(b.startTime/1000)}:T> — Geçen: \`${formatSure(Date.now()-b.startTime)}\``, ephemeral: true });
    }
    mesaiBaslangic.set(user.id, { startTime: Date.now(), displayName });
    const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle("🟢 Mesai Başlatıldı").setDescription(`**${displayName}**, mesainiz başlatıldı!`).addFields({ name: "Başlangıç", value: `<t:${Math.floor(Date.now()/1000)}:T>` }).setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (customId === "mesai_bitir") {
    if (!mesaiBaslangic.has(user.id)) {
      return interaction.reply({ content: "❌ Aktif mesainiz yok. Önce **Mesai Başlat** butonuna basın.", ephemeral: true });
    }
    const b = mesaiBaslangic.get(user.id);
    const sure = Date.now() - b.startTime;
    mesaiBaslangic.delete(user.id);
    const mevcut = haftalikMesai.get(user.id) || { totalMs: 0, displayName };
    mevcut.totalMs += sure;
    mevcut.displayName = displayName;
    haftalikMesai.set(user.id, mevcut);
    const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle("🔴 Mesai Sonlandırıldı").setDescription(`**${displayName}**, mesainiz kaydedildi.`).addFields(
      { name: "Başlangıç", value: `<t:${Math.floor(b.startTime/1000)}:T>`, inline: true },
      { name: "Bitiş", value: `<t:${Math.floor(Date.now()/1000)}:T>`, inline: true },
      { name: "⏱️ Bu Mesai", value: `\`\`\`${formatSure(sure)}\`\`\`` },
      { name: "📈 Haftalık Toplam", value: `\`\`\`${formatSure(mevcut.totalMs)}\`\`\`` }
    ).setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (customId === "mesai_top") {
    if (haftalikMesai.size === 0) {
      return interaction.reply({ content: "📊 Bu hafta henüz mesai kaydı yok.", ephemeral: false });
    }
    const sirali = [...haftalikMesai.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);
    const madalyalar = ["🥇","🥈","🥉"];
    const liste = sirali.map(([,v], i) => `${madalyalar[i] || `**${i+1}.**`} **${v.displayName}** — \`${formatSure(v.totalMs)}\``).join("\n");
    const embed = new EmbedBuilder().setColor(0x1a3a5c).setTitle("📊 Haftalık Mesai Tablosu").addFields({ name: `Toplam ${sirali.length} Personel`, value: liste }).setFooter({ text: "Veriler her Pazartesi sıfırlanır" }).setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
});

client.login(CONFIG.TOKEN);
