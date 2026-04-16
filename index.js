const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// ============================================================
// AYARLAR - Kendi sunucunuza göre değiştirin
// ============================================================
const CONFIG = {
  TOKEN: "MTQ5NDMyMjkwODE2Njc1MDI3OQ.G5eMsc.KszhTO45hvGL4kzFfLJ5Fs5PgKe6QCrm0wAybA",
  MESAI_KANAL_ID: "1494322752767660132",       // Panelin gönderileceği kanal
  YETKILI_ROL_ID: "1131592697170370640",             // Paneli kurabilecek rol (opsiyonel)
};
// ============================================================

// Hafıza: aktif mesailer ve haftalık toplamlar
// mesaiBaslangic: { userId -> { startTime, username, displayName } }
// haftalikMesai:  { userId -> { totalMs, username, displayName } }
const mesaiBaslangic = new Map();
const haftalikMesai = new Map();

// Her Pazartesi 00:00'da haftalık veriyi sıfırla
function haftalikSifirla() {
  const simdi = new Date();
  const gunler = simdi.getDay(); // 0=Pazar, 1=Pazartesi...
  const saatlerKalan =
    ((1 - gunler + 7) % 7) * 24 * 60 * 60 * 1000 -
    simdi.getHours() * 60 * 60 * 1000 -
    simdi.getMinutes() * 60 * 1000 -
    simdi.getSeconds() * 1000 -
    simdi.getMilliseconds();
  const ilkSifirlamaSuresi = saatlerKalan <= 0 ? saatlerKalan + 7 * 24 * 60 * 60 * 1000 : saatlerKalan;

  setTimeout(() => {
    haftalikMesai.clear();
    console.log("Haftalık mesai verileri sıfırlandı.");
    setInterval(() => {
      haftalikMesai.clear();
      console.log("Haftalık mesai verileri sıfırlandı.");
    }, 7 * 24 * 60 * 60 * 1000);
  }, ilkSifirlamaSuresi);
}

// ms cinsinden süreyi okunabilir formata çevir
function formatSure(ms) {
  if (ms < 0) ms = 0;
  const totalSaniye = Math.floor(ms / 1000);
  const saat = Math.floor(totalSaniye / 3600);
  const dakika = Math.floor((totalSaniye % 3600) / 60);
  const saniye = totalSaniye % 60;
  return `${saat}s ${dakika}dk ${saniye}sn`;
}

// Mesai paneli embed ve butonlarını oluştur
function mesaiPaneliOlustur() {
  const embed = new EmbedBuilder()
    .setTitle("🚔  BCSO — Mesai Paneli")
    .setDescription(
      "```\nBlaine County Sheriff Office\nMesai Takip Sistemi\n```\n" +
        "Aşağıdaki butonları kullanarak mesainizi başlatın, sonlandırın\nveya haftalık toplamı görüntüleyin."
    )
    .setColor(0x1a3a5c)
    .setThumbnail(
      "https://i.imgur.com/QTbIoFl.png" // BCSO rozeti (isteğe göre değiştirin)
    )
    .addFields(
      {
        name: "🟢  Mesai Başlat",
        value: "Göreve başladığınızda saatinizi kayıt altına alır.",
        inline: false,
      },
      {
        name: "🔴  Mesai Sonlandır",
        value: "Görev sürenizi hesaplar ve size özel bildirir.",
        inline: false,
      },
      {
        name: "📊  Haftalık Top",
        value: "Bu haftaki tüm personelin mesai toplamını listeler.",
        inline: false,
      }
    )
    .setFooter({
      text: "BCSO FiveM • Mesai Sistemi",
    })
    .setTimestamp();

  const satir = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("mesai_baslat")
      .setLabel("Mesai Başlat")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🟢"),
    new ButtonBuilder()
      .setCustomId("mesai_bitir")
      .setLabel("Mesai Sonlandır")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔴"),
    new ButtonBuilder()
      .setCustomId("mesai_top")
      .setLabel("Haftalık Top")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📊")
  );

  return { embeds: [embed], components: [satir] };
}

// -------------------------------------------------------
// BOT HAZIR
// -------------------------------------------------------
client.once("ready", () => {
  console.log(`✅  Bot aktif: ${client.user.tag}`);
  haftalikSifirla();
});

// -------------------------------------------------------
// SLASH KOMUT: /mesaipanel  (paneli kanala gönderir)
// -------------------------------------------------------
client.on("interactionCreate", async (interaction) => {
  // ---------- SLASH KOMUT ----------
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "mesaipanel") {
      // Yetki kontrolü
      if (
        CONFIG.YETKILI_ROL_ID &&
        !interaction.member.roles.cache.has(CONFIG.YETKILI_ROL_ID) &&
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        return interaction.reply({
          content: "❌ Bu komutu kullanmak için yetkiniz yok.",
          ephemeral: true,
        });
      }

      const kanal = interaction.channel;
      await kanal.send(mesaiPaneliOlustur());
      await interaction.reply({ content: "✅ Mesai paneli gönderildi.", ephemeral: true });
    }
    return;
  }

  // ---------- BUTON ----------
  if (!interaction.isButton()) return;

  const { customId, user, member } = interaction;
  const displayName = member?.displayName || user.username;

  // ====================================================
  // 1. BUTON — MESAİ BAŞLAT
  // ====================================================
  if (customId === "mesai_baslat") {
    if (mesaiBaslangic.has(user.id)) {
      const baslangic = mesaiBaslangic.get(user.id);
      const gecenSure = Date.now() - baslangic.startTime;
      return interaction.reply({
        content:
          `⚠️ **${displayName}**, zaten aktif bir mesainiz var!\n` +
          `Başlangıç: <t:${Math.floor(baslangic.startTime / 1000)}:T> — Geçen süre: \`${formatSure(gecenSure)}\``,
        ephemeral: true,
      });
    }

    mesaiBaslangic.set(user.id, {
      startTime: Date.now(),
      username: user.username,
      displayName,
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🟢  Mesai Başlatıldı")
      .setDescription(
        `**${displayName}**, mesainiz başarıyla başlatıldı.\nGörevinizde başarılar, şerif!`
      )
      .addFields({
        name: "Başlangıç Saati",
        value: `<t:${Math.floor(Date.now() / 1000)}:T>`,
        inline: true,
      })
      .setFooter({ text: "BCSO FiveM • Mesai Takip" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ====================================================
  // 2. BUTON — MESAİ SONLANDIR
  // ====================================================
  if (customId === "mesai_bitir") {
    if (!mesaiBaslangic.has(user.id)) {
      return interaction.reply({
        content: "❌ Aktif bir mesainiz bulunmuyor. Önce **Mesai Başlat** butonuna basın.",
        ephemeral: true,
      });
    }

    const baslangic = mesaiBaslangic.get(user.id);
    const sure = Date.now() - baslangic.startTime;
    mesaiBaslangic.delete(user.id);

    // Haftalık toplama ekle
    const mevcut = haftalikMesai.get(user.id) || { totalMs: 0, username: user.username, displayName };
    mevcut.totalMs += sure;
    mevcut.displayName = displayName;
    haftalikMesai.set(user.id, mevcut);

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔴  Mesai Sonlandırıldı")
      .setDescription(`**${displayName}**, mesainiz başarıyla kaydedildi.`)
      .addFields(
        {
          name: "Başlangıç",
          value: `<t:${Math.floor(baslangic.startTime / 1000)}:T>`,
          inline: true,
        },
        {
          name: "Bitiş",
          value: `<t:${Math.floor(Date.now() / 1000)}:T>`,
          inline: true,
        },
        {
          name: "⏱️  Bu Mesai Süresi",
          value: `\`\`\`${formatSure(sure)}\`\`\``,
          inline: false,
        },
        {
          name: "📈  Haftalık Toplam",
          value: `\`\`\`${formatSure(mevcut.totalMs)}\`\`\``,
          inline: false,
        }
      )
      .setFooter({ text: "BCSO FiveM • Mesai Takip" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ====================================================
  // 3. BUTON — HAFTALIK TOP
  // ====================================================
  if (customId === "mesai_top") {
    if (haftalikMesai.size === 0) {
      return interaction.reply({
        content: "📊 Bu hafta henüz hiç mesai kaydı bulunmuyor.",
        ephemeral: false,
      });
    }

    // Toplam mesaiye göre sırala (en fazladan en aza)
    const sirali = [...haftalikMesai.entries()].sort(
      (a, b) => b[1].totalMs - a[1].totalMs
    );

    const madalyalar = ["🥇", "🥈", "🥉"];
    let liste = "";
    sirali.forEach(([, veri], index) => {
      const madalya = madalyalar[index] || `**${index + 1}.**`;
      liste += `${madalya} **${veri.displayName}** — \`${formatSure(veri.totalMs)}\`\n`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x1a3a5c)
      .setTitle("📊  Haftalık Mesai Tablosu")
      .setDescription(
        "```\nBlaine County Sheriff Office\nHaftalık Mesai Sıralaması\n```"
      )
      .addFields({
        name: `Toplam ${sirali.length} Personel`,
        value: liste,
        inline: false,
      })
      .setFooter({
        text: "BCSO FiveM • Veriler her Pazartesi sıfırlanır",
      })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: false });
  }
});

// -------------------------------------------------------
// SLASH KOMUTLARI KAYDET (botu ilk başlatırken bir kez)
// -------------------------------------------------------
async function slashKomutlariKaydet() {
  const { REST, Routes, SlashCommandBuilder } = require("discord.js");
  const rest = new REST({ version: "10" }).setToken(CONFIG.TOKEN);

  const komutlar = [
    new SlashCommandBuilder()
      .setName("mesaipanel")
      .setDescription("BCSO mesai panelini bu kanala gönderir.")
      .toJSON(),
  ];

  try {
    console.log("Slash komutları kaydediliyor...");
    await rest.put(Routes.applicationCommands(client.user.id), { body: komutlar });
    console.log("✅ Slash komutları kaydedildi.");
  } catch (err) {
    console.error("Slash komut kaydı hatası:", err);
  }
}

client.once("ready", slashKomutlariKaydet);

// Botu başlat
client.login(CONFIG.TOKEN);
