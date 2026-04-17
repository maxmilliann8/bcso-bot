const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const TOKEN = process.env.TOKEN;

// Her sunucu için ayrı ayar ve veri
// sunucuAyarlar: { guildId -> { logKanalId, yetkiliRolId, sifirlamaGun, sifirlamaSaat } }
// sunucuMesai:   { guildId -> Map<userId, { totalMs, displayName }> }
// sunucuBaslangic: { guildId -> Map<userId, { startTime, displayName }> }
const sunucuAyarlar = new Map();
const sunucuMesai = new Map();
const sunucuBaslangic = new Map();
const sunucuSifirlamaTimeout = new Map();

const gunIsimler = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function getAyarlar(guildId) {
  if (!sunucuAyarlar.has(guildId)) {
    sunucuAyarlar.set(guildId, { logKanalId: null, yetkiliRolId: null, sifirlamaGun: 1, sifirlamaSaat: 0 });
  }
  return sunucuAyarlar.get(guildId);
}

function getMesai(guildId) {
  if (!sunucuMesai.has(guildId)) sunucuMesai.set(guildId, new Map());
  return sunucuMesai.get(guildId);
}

function getBaslangic(guildId) {
  if (!sunucuBaslangic.has(guildId)) sunucuBaslangic.set(guildId, new Map());
  return sunucuBaslangic.get(guildId);
}

function formatSure(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/3600)}s ${Math.floor((s%3600)/60)}dk ${s%60}sn`;
}

function haftalikSifirlamaAyarla(guildId) {
  if (sunucuSifirlamaTimeout.has(guildId)) clearTimeout(sunucuSifirlamaTimeout.get(guildId));
  const ayarlar = getAyarlar(guildId);
  const simdi = new Date();
  const hedef = new Date();
  hedef.setHours(ayarlar.sifirlamaSaat, 0, 0, 0);
  const gunFark = (ayarlar.sifirlamaGun - simdi.getDay() + 7) % 7;
  hedef.setDate(hedef.getDate() + (gunFark === 0 && hedef <= simdi ? 7 : gunFark));
  const kalan = hedef - simdi;
  const timeout = setTimeout(() => {
    getMesai(guildId).clear();
    console.log(`[${guildId}] Haftalık mesai verileri sıfırlandı.`);
    haftalikSifirlamaAyarla(guildId);
  }, kalan);
  sunucuSifirlamaTimeout.set(guildId, timeout);
}

async function logGonder(guildId, embed) {
  const ayarlar = getAyarlar(guildId);
  if (!ayarlar.logKanalId) return;
  try {
    const kanal = await client.channels.fetch(ayarlar.logKanalId);
    if (kanal) await kanal.send({ embeds: [embed] });
  } catch (e) {
    console.error(`[${guildId}] Log gönderme hatası:`, e.message);
  }
}

function yetkiKontrol(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const ayarlar = getAyarlar(member.guild.id);
  if (ayarlar.yetkiliRolId && member.roles.cache.has(ayarlar.yetkiliRolId)) return true;
  return false;
}

function mesaiPaneliOlustur() {
  const embed = new EmbedBuilder()
    .setTitle("🚔  BCSO — Mesai Paneli")
    .setDescription("```\nBlaine County Sheriff Office\nMesai Takip Sistemi\n```\nAşağıdaki butonları kullanarak mesainizi yönetin.")
    .setColor(0x1a3a5c)
    .addFields(
      { name: "🟢  Mesai Başlat", value: "Göreve başladığınızda saatinizi kayıt altına alır.", inline: false },
      { name: "🔴  Mesai Sonlandır", value: "Görev sürenizi hesaplar ve size özel bildirir.", inline: false },
      { name: "📊  Haftalık Top", value: "Bu haftaki tüm personelin mesai toplamını listeler.", inline: false }
    )
    .setFooter({ text: "BCSO FiveM • Mesai Sistemi" })
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

  // Tüm sunucular için sıfırlama zamanlayıcısını başlat
  client.guilds.cache.forEach(guild => haftalikSifirlamaAyarla(guild.id));

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const komutlar = [
    new SlashCommandBuilder()
      .setName("mesaipanel")
      .setDescription("BCSO mesai panelini gönderir.")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("ayarla-yetkilirol")
      .setDescription("[SADECE SUNUCU ADMİNİ] Hangi rol admin komutlarını kullanabilsin?")
      .addRoleOption(opt => opt.setName("rol").setDescription("Yetkili rol").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("ayarla-kanal")
      .setDescription("[ADMİN] Mesai loglarının gönderileceği kanalı ayarlar.")
      .addChannelOption(opt => opt.setName("kanal").setDescription("Log kanalı").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("ayarla-sifirlama")
      .setDescription("[ADMİN] Haftalık sıfırlama gününü ve saatini ayarlar.")
      .addIntegerOption(opt => opt.setName("gun").setDescription("0=Pazar 1=Pazartesi 2=Salı 3=Çarşamba 4=Perşembe 5=Cuma 6=Cumartesi").setRequired(true).setMinValue(0).setMaxValue(6))
      .addIntegerOption(opt => opt.setName("saat").setDescription("Sıfırlama saati (0-23)").setRequired(true).setMinValue(0).setMaxValue(23))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("ayarlar")
      .setDescription("[ADMİN] Mevcut bot ayarlarını gösterir.")
      .toJSON(),
  ];

  await rest.put(Routes.applicationCommands(client.user.id), { body: komutlar });
  console.log("✅ Slash komutları kaydedildi.");
});

// Yeni sunucuya eklenince zamanlayıcıyı başlat
client.on("guildCreate", (guild) => {
  haftalikSifirlamaAyarla(guild.id);
  console.log(`✅ Yeni sunucuya eklendi: ${guild.name}`);
});

client.on("interactionCreate", async (interaction) => {

  // ===================== SLASH KOMUTLAR =====================
  if (interaction.isChatInputCommand()) {
    const { commandName, member, guildId } = interaction;
    const ayarlar = getAyarlar(guildId);

    // /mesaipanel
    if (commandName === "mesaipanel") {
      if (!yetkiKontrol(member)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      await interaction.channel.send(mesaiPaneliOlustur());
      return interaction.reply({ content: "✅ Panel gönderildi.", ephemeral: true });
    }

    // /ayarla-yetkilirol — SADECE SUNUCU ADMİNİ kullanabilir
    if (commandName === "ayarla-yetkilirol") {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Bu komutu yalnızca **sunucu admini** kullanabilir.", ephemeral: true });
      }
      const rol = interaction.options.getRole("rol");
      ayarlar.yetkiliRolId = rol.id;
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Yetkili Rol Ayarlandı")
        .setDescription(`<@&${rol.id}> rolü artık admin komutlarını kullanabilir.`)
        .setFooter({ text: `Ayarlayan: ${member.displayName}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // /ayarla-kanal
    if (commandName === "ayarla-kanal") {
      if (!yetkiKontrol(member)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      const kanal = interaction.options.getChannel("kanal");
      ayarlar.logKanalId = kanal.id;
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Log Kanalı Ayarlandı")
        .setDescription(`Mesai logları artık <#${kanal.id}> kanalına gönderilecek.`)
        .setFooter({ text: `Ayarlayan: ${member.displayName}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // /ayarla-sifirlama
    if (commandName === "ayarla-sifirlama") {
      if (!yetkiKontrol(member)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      const gun = interaction.options.getInteger("gun");
      const saat = interaction.options.getInteger("saat");
      ayarlar.sifirlamaGun = gun;
      ayarlar.sifirlamaSaat = saat;
      haftalikSifirlamaAyarla(guildId);
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Sıfırlama Zamanı Ayarlandı")
        .addFields(
          { name: "Gün", value: gunIsimler[gun], inline: true },
          { name: "Saat", value: `${saat}:00`, inline: true }
        )
        .setDescription("Haftalık mesai verileri bu zamanda otomatik sıfırlanacak.")
        .setFooter({ text: `Ayarlayan: ${member.displayName}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // /ayarlar
    if (commandName === "ayarlar") {
      if (!yetkiKontrol(member)) return interaction.reply({ content: "❌ Yetkiniz yok.", ephemeral: true });
      const embed = new EmbedBuilder()
        .setColor(0x1a3a5c)
        .setTitle("⚙️ Mevcut Bot Ayarları")
        .addFields(
          { name: "👮 Yetkili Rol", value: ayarlar.yetkiliRolId ? `<@&${ayarlar.yetkiliRolId}>` : "Ayarlanmamış (sadece admin)", inline: false },
          { name: "📋 Log Kanalı", value: ayarlar.logKanalId ? `<#${ayarlar.logKanalId}>` : "Ayarlanmamış", inline: true },
          { name: "📅 Sıfırlama Günü", value: gunIsimler[ayarlar.sifirlamaGun], inline: true },
          { name: "🕐 Sıfırlama Saati", value: `${ayarlar.sifirlamaSaat}:00`, inline: true }
        )
        .setFooter({ text: "BCSO FiveM • Mesai Sistemi" })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return;
  }

  // ===================== BUTONLAR =====================
  if (!interaction.isButton()) return;

  const { customId, user, member, guildId } = interaction;
  const displayName = member?.displayName || user.username;
  const mesaiBaslangic = getBaslangic(guildId);
  const haftalikMesai = getMesai(guildId);

  // 🟢 MESAİ BAŞLAT
  if (customId === "mesai_baslat") {
    if (mesaiBaslangic.has(user.id)) {
      const b = mesaiBaslangic.get(user.id);
      return interaction.reply({
        content: `⚠️ Zaten aktif mesainiz var!\nBaşlangıç: <t:${Math.floor(b.startTime/1000)}:T> — Geçen: \`${formatSure(Date.now()-b.startTime)}\``,
        ephemeral: true
      });
    }
    mesaiBaslangic.set(user.id, { startTime: Date.now(), displayName });
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71).setTitle("🟢 Mesai Başlatıldı")
      .setDescription(`**${displayName}**, mesainiz başlatıldı!`)
      .addFields({ name: "Başlangıç", value: `<t:${Math.floor(Date.now()/1000)}:T>` })
      .setTimestamp();
    await logGonder(guildId, new EmbedBuilder().setColor(0x2ecc71).setTitle("🟢 Mesai Başladı").setDescription(`**${displayName}** mesaiye başladı.`).addFields({ name: "Saat", value: `<t:${Math.floor(Date.now()/1000)}:T>` }).setTimestamp());
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 🔴 MESAİ BİTİR
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
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c).setTitle("🔴 Mesai Sonlandırıldı")
      .setDescription(`**${displayName}**, mesainiz kaydedildi.`)
      .addFields(
        { name: "Başlangıç", value: `<t:${Math.floor(b.startTime/1000)}:T>`, inline: true },
        { name: "Bitiş", value: `<t:${Math.floor(Date.now()/1000)}:T>`, inline: true },
        { name: "⏱️ Bu Mesai", value: `\`\`\`${formatSure(sure)}\`\`\`` },
        { name: "📈 Haftalık Toplam", value: `\`\`\`${formatSure(mevcut.totalMs)}\`\`\`` }
      ).setTimestamp();
    await logGonder(guildId, new EmbedBuilder().setColor(0xe74c3c).setTitle("🔴 Mesai Bitti").setDescription(`**${displayName}** mesaisini sonlandırdı.`).addFields({ name: "Süre", value: formatSure(sure), inline: true }, { name: "Haftalık Toplam", value: formatSure(mevcut.totalMs), inline: true }).setTimestamp());
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 📊 HAFTALIK TOP
  if (customId === "mesai_top") {
    if (haftalikMesai.size === 0) {
      return interaction.reply({ content: "📊 Bu hafta henüz mesai kaydı yok.", ephemeral: false });
    }
    const ayarlar = getAyarlar(guildId);
    const sirali = [...haftalikMesai.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);
    const madalyalar = ["🥇","🥈","🥉"];
    const liste = sirali.map(([,v], i) => `${madalyalar[i] || `**${i+1}.**`} **${v.displayName}** — \`${formatSure(v.totalMs)}\``).join("\n");
    const embed = new EmbedBuilder()
      .setColor(0x1a3a5c).setTitle("📊 Haftalık Mesai Tablosu")
      .addFields({ name: `Toplam ${sirali.length} Personel`, value: liste })
      .setFooter({ text: `Sıfırlama: Her ${gunIsimler[ayarlar.sifirlamaGun]} ${ayarlar.sifirlamaSaat}:00` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
});

client.login(TOKEN);
