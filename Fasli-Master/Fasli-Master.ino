#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPIFFS.h>
#include <WebServer.h>
#include <WiFiUdp.h>
#include <string.h>

// =========================================================
// ⚙️ إعدادات الشبكة — بورد الماستر (استقبال كروت المخزون فقط، مالوش علاقة بحضور أي مدرس)
// =========================================================
String wifi_ssid = "";
String wifi_password = "";
// ⚠️ (تحديث بعد الانتقال لحساب Supabase جديد بالكامل) الرابط والمفتاح دول كانوا لسه واقفين
// على المشروع القديم (yxkyxxzcnxpxefodfxnl) من قبل النقل — أي بورد شغّال بالكود القديم كان
// بيبعت بياناته لمشروع ميت مالوش أي علاقة بقاعدة البيانات الحالية
const char* SUPABASE_URL = "https://ugvuwiaemrrtwplphkdn.supabase.co";
const char* ANON_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVndnV3aWFlbXJydHdwbHBoa2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NjMyNjIsImV4cCI6MjEwNTIzOTI2Mn0.Vb5eh4DZhVJe-7m9sgM4ztXKJRbOAXDRT5oeeUv8boY"; // ده لسه لازم بس لعمليات ping البسيطة، مش للتوثيق الحقيقي
// ✅ (فِكس) "عرض مفتاح جهاز الماستر" في لوحة المشرف كان بيولّد مفتاح عشوائي جديد في كل ضغطة
// من غير ما يتحفظ فعليًا في القاعدة (صف master_device كان مش موجود أصلاً، فالتحديث كان بيفشل
// بصمت) — يعني أي قيمة اتنسخت قبل كده من الزرار ده كانت وهمية ومش هتشتغل. القيمة تحت دلوقتي
// هي أول قيمة حقيقية اتحفظت فعليًا في القاعدة بعد إصلاح المشكلة دي — لو عملتي "توليد مفتاح
// جديد" من الزرار الجديد جوه لوحة المشرف بعد كده، حدّثي القيمة هنا بالمفتاح الجديد وعملي فلاش تاني
const char* DEVICE_SECRET = "12d0347901538df59a0f3af09b62767f";

// =========================================================
// 🔌 إعدادات الدبابيس (بدون أي تغيير — نفس أماكن اللمبات والبازر زي ما كانت بالظبط)
// =========================================================
#define SS_PIN    5
#define RST_PIN   4
#define LED_READY 14
#define LED_GREEN 12
#define LED_RED   13
#define LED_BLUE  27
#define BUZZER    22

// =========================================================
// 📶 (إضافة) إعدادات وضع نقطة الوصول (Access Point) وصفحة الإعداد — مفيش كود مدرس هنا
// أصلاً (الماستر مش تابع لمدرس معيّن)، فصفحة الإعداد بتاخد SSID + كلمة مرور الشبكة بس
// =========================================================
const char* AP_SSID_PREFIX = "Fasli-Master-Setup";
const char* AP_PASSWORD = "fasli1234";
const byte DNS_PORT = 53;
WebServer webServer(80);
bool ap_mode_active = false;

unsigned long lastBackgroundRetry = 0;
const unsigned long BACKGROUND_RETRY_INTERVAL = 30000;

// =========================================================
// 📦 المتغيرات العامة
// =========================================================
MFRC522 mfrc522(SS_PIN, RST_PIN);
QueueHandle_t cardQueue;

struct CardData {
  char uid[16];
};

bool wifi_connected = false;
bool server_online = false;
unsigned long lastPingTime = 0;
const unsigned long PING_INTERVAL = 5000;
bool lastStatusSent = false;

// =========================================================
// 💡 دالة وميض اللمبة (مع اختيار الجرس) - يجب تعريفها قبل استخدامها
// =========================================================
void blinkLED(int pin, int times, int duration, bool withBuzzer = false) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    if (withBuzzer) {
      digitalWrite(BUZZER, HIGH);
    }
    delay(duration);
    digitalWrite(pin, LOW);
    if (withBuzzer) {
      digitalWrite(BUZZER, LOW);
    }
    delay(duration);
  }
}

// =========================================================
// 📤 إرسال الحالة عبر Serial للصفحة
// =========================================================
void sendStatus(String status) {
  Serial.println("STATUS:" + status);
}

// =========================================================
// 📶 تحميل إعدادات الواي فاي
// =========================================================
bool loadWiFiConfig() {
  if (!SPIFFS.begin(true)) {
    Serial.println("❌ فشل تحميل SPIFFS");
    return false;
  }
  if (!SPIFFS.exists("/wifi.json")) {
    Serial.println("📄 ملف الإعدادات غير موجود");
    return false;
  }
  File file = SPIFFS.open("/wifi.json", "r");
  if (!file) {
    Serial.println("❌ فشل فتح ملف الإعدادات");
    return false;
  }
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, file);
  file.close();
  if (error) {
    Serial.println("❌ خطأ في قراءة ملف الإعدادات");
    return false;
  }
  wifi_ssid = doc["ssid"] | "";
  wifi_password = doc["password"] | "";
  Serial.println("✅ تم تحميل الإعدادات:");
  Serial.println("   SSID: " + wifi_ssid);
  Serial.println("   PASS: " + wifi_password);
  return true;
}

// =========================================================
// 💾 حفظ إعدادات الواي فاي
// =========================================================
bool saveWiFiConfig(String ssid, String password) {
  if (!SPIFFS.begin(true)) {
    Serial.println("❌ فشل تحميل SPIFFS");
    return false;
  }
  File file = SPIFFS.open("/wifi.json", "w");
  if (!file) {
    Serial.println("❌ فشل فتح ملف الإعدادات للكتابة");
    return false;
  }
  StaticJsonDocument<200> doc;
  doc["ssid"] = ssid;
  doc["password"] = password;
  if (serializeJson(doc, file) == 0) {
    Serial.println("❌ فشل كتابة ملف الإعدادات");
    file.close();
    return false;
  }
  file.close();
  Serial.println("✅ تم حفظ الإعدادات");
  Serial.println("   SSID: " + ssid);
  Serial.println("   PASS: " + password);
  wifi_ssid = ssid;
  wifi_password = password;
  return true;
}

// =========================================================
// 📶 الاتصال بالواي فاي
// =========================================================
void connectWiFi() {
  if (wifi_ssid.length() == 0) {
    Serial.println("⚠️ لا توجد إعدادات واي فاي");
    return;
  }
  // ✅ (إضافة) نرجّع وضع الواي فاي لـ STA صراحة — مهم لو الجهاز كان في وضع الإعداد
  // (WIFI_AP_STA) قبل كده وبيحاول يتصل بشبكة حقيقية دلوقتي
  WiFi.mode(WIFI_STA);
  Serial.print("📶 جاري الاتصال بـ " + wifi_ssid + "...");
  WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    digitalWrite(LED_READY, !digitalRead(LED_READY));
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifi_connected = true;
    digitalWrite(LED_READY, HIGH);
    Serial.println("\n✅ تم الاتصال! IP: " + WiFi.localIP().toString());
    blinkLED(LED_GREEN, 2, 150, false);
    sendStatus("WIFI_CONNECTED");
    // ✅ (إضافة) لو هوائي RFID كان مقفول بسبب وضع الإعداد، نرجّعه يشتغل تاني
    mfrc522.PCD_AntennaOn();
  } else {
    wifi_connected = false;
    digitalWrite(LED_READY, LOW);
    Serial.println("\n❌ فشل الاتصال");
    blinkLED(LED_RED, 4, 300, true);
    sendStatus("WIFI_FAILED");
  }
}

// =========================================================
// 📡 (إضافة) وضع نقطة الوصول (Access Point) + صفحة الإعداد (Captive Portal) — لضبط
// شبكة الواي فاي بس (SSID + كلمة مرور)، من غير أي كود مدرس لأن الماستر مش تابع لمدرس معيّن
// =========================================================

const char* SETUP_PAGE_HTML = R"HTMLPAGE(
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>إعداد جهاز الماستر - فَصلي</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; background: #0B1C33; color: #fff; margin: 0; padding: 24px 16px; direction: rtl; }
    .card { max-width: 420px; margin: 0 auto; background: rgba(255,255,255,0.06); border-radius: 16px; padding: 24px; border: 1px solid rgba(255,255,255,0.1); }
    h1 { font-size: 20px; text-align: center; margin: 0 0 6px; }
    p.sub { text-align: center; font-size: 13px; color: rgba(255,255,255,0.65); margin: 0 0 20px; }
    label { display: block; font-size: 13px; font-weight: bold; margin: 14px 0 6px; }
    input { width: 100%; padding: 11px 12px; border-radius: 10px; border: 1.5px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; font-size: 14px; box-sizing: border-box; }
    input::placeholder { color: rgba(255,255,255,0.4); }
    button { width: 100%; margin-top: 22px; padding: 13px; border: none; border-radius: 10px; background: #F2B705; color: #0B1C33; font-weight: bold; font-size: 15px; cursor: pointer; }
    .hint { font-size: 11.5px; color: rgba(255,255,255,0.5); margin-top: 6px; }
    .msg { text-align: center; margin-top: 16px; font-size: 13px; padding: 10px; border-radius: 8px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📡 إعداد جهاز الماستر (كروت المنظومة)</h1>
    <p class="sub">أدخل بيانات شبكة الواي فاي عشان الجهاز يشتغل ويستقبل كروت المخزون</p>
    <form id="setupForm">
      <label>اسم شبكة الواي فاي (SSID)</label>
      <input type="text" id="ssid" placeholder="اسم الشبكة" required>

      <label>كلمة مرور الشبكة</label>
      <input type="password" id="password" placeholder="كلمة المرور">
      <div class="hint">اسيبها فاضية لو الشبكة مفتوحة بدون كلمة مرور</div>

      <button type="submit">💾 حفظ وإعادة التشغيل</button>
      <div class="msg" id="msgBox"></div>
    </form>
  </div>
  <script>
    document.getElementById('setupForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var msgBox = document.getElementById('msgBox');
      msgBox.style.display = 'block';
      msgBox.style.background = 'rgba(255,255,255,0.1)';
      msgBox.textContent = '⏳ جاري الحفظ...';

      var params = new URLSearchParams();
      params.append('ssid', document.getElementById('ssid').value.trim());
      params.append('password', document.getElementById('password').value);

      fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
        .then(function(r) { return r.text().then(function(txt) { return { ok: r.ok, status: r.status, text: txt }; }); })
        .then(function(result) {
          if (result.ok) {
            msgBox.style.background = '#F2B70522';
            msgBox.textContent = '✅ اتحفظ! الجهاز بيعيد التشغيل دلوقتي، وهيحاول يتصل بالشبكة الجديدة...';
          } else {
            msgBox.style.background = '#e5484d33';
            msgBox.textContent = '❌ ' + (result.text || 'حصل خطأ، جربي تاني');
          }
        })
        .catch(function() {
          msgBox.style.background = '#e5484d33';
          msgBox.textContent = '❌ تعذر الاتصال بالجهاز، جربي تاني';
        });
    });
  </script>
</body>
</html>
)HTMLPAGE";

void handleRoot() {
  webServer.send(200, "text/html", SETUP_PAGE_HTML);
}

void handleSave() {
  String newSsid = webServer.arg("ssid");
  String newPassword = webServer.arg("password");
  newSsid.trim();

  if (newSsid.length() == 0) {
    webServer.send(400, "text/plain", "اسم الشبكة مطلوب");
    return;
  }

  saveWiFiConfig(newSsid, newPassword);
  webServer.send(200, "text/plain", "تم الحفظ، الجهاز بيعيد التشغيل...");

  delay(1500);
  ESP.restart();
}

void handleNotFound() {
  // ✅ (تشخيص) لو صفحة الإعداد مش بتفتح لوحدها على موبايل معيّن، السطر ده بيوريك في
  // Serial Monitor هل طلب فحص الاتصال بتاع الموبايل (زي generate_204 من أندرويد أو
  // hotspot-detect.html من آيفون) وصل للجهاز أصلاً ولا لأ. لو معملتش-اتصل ومفيش أي سطر
  // ظهر هنا خالص، المشكلة مش في الكود — الموبايل أصلاً مش بيبعت طلب الفحص ده على الشبكة
  // دي (غالبًا DNS خاص/مشفّر "Private DNS" مفعّل ومحدّد بسيرفر معيّن بدل "تلقائي"، فبيتجاهل
  // سيرفر الـDNS بتاع نقطة الوصول تمامًا ومفيش إنترنت حقيقي يوصله بيه، فالفحص بيفشل بصمت)
  Serial.println("🌐 طلب وصل: Host=" + webServer.hostHeader() + " URI=" + webServer.uri());
  webServer.sendHeader("Location", "/", true);
  webServer.send(302, "text/plain", "");
}

// =========================================================
// 🌐 (فِكس أعمق: صفحة الإعداد مش بتفتح لوحدها على تابلت أندرويد سامسونج تحديدًا) دي إن إس
// مخصّصة مكتوبة يدويًا بدل مكتبة DNSServer الجاهزة. المكتبة الجاهزة بترد على أي استعلام —
// حتى استعلامات AAAA (IPv6) — بنفس رد نوع A، وده رد غير صحيح تقنيًا لاستعلام من نوع مختلف؛
// بعض الأجهزة (زي ما لاحظنا مع تابلت سامسونج معيّن) بترفض الرد الغلط ده أو تستنى timeout
// بدل ما ترجع فورًا للـIPv4 اللي أصلاً معاها من رد A سابق، وده كان بيأخّر أو يوقف فحص
// الاتصال بتاع الموبايل قبل ما يوصلنا خالص. النسخة دي:
//   - استعلام من نوع A: بترد بعنوان الجهاز الحقيقي (زي المكتبة الجاهزة بالظبط)
//   - أي استعلام تاني (خصوصًا AAAA): بترد فورًا بـNXDOMAIN (مفيش سجل) صراحة، عشان أي جهاز
//     يقدر يكمّل فورًا بدل ما ينتظر
// =========================================================
WiFiUDP dnsUdp;
IPAddress dnsResolveIP;

void startCustomDnsServer(IPAddress resolveIP) {
  dnsResolveIP = resolveIP;
  dnsUdp.begin(DNS_PORT);
}

void stopCustomDnsServer() {
  dnsUdp.stop();
}

void processCustomDnsRequests() {
  int packetSize = dnsUdp.parsePacket();
  if (packetSize <= 0) return;

  const int MAX_DNS_PACKET = 512;
  if (packetSize > MAX_DNS_PACKET) packetSize = MAX_DNS_PACKET;
  uint8_t buffer[MAX_DNS_PACKET];
  int len = dnsUdp.read(buffer, packetSize);
  if (len < 12) return; // رأس DNS لازم يكون 12 بايت على الأقل

  // نتخطى اسم النطاق (QNAME) في قسم السؤال عشان نوصل لـQTYPE — مع حماية من أي حزمة تالفة
  int pos = 12;
  while (pos < len && buffer[pos] != 0) {
    int labelLen = buffer[pos];
    if (labelLen > 63 || pos + labelLen + 1 >= len) return;
    pos += labelLen + 1;
  }
  if (pos >= len) return;
  pos++; // نتخطى البايت الصفري النهائي لاسم النطاق
  if (pos + 4 > len) return; // لازم يكون فاضل QTYPE(2)+QCLASS(2)

  int questionEnd = pos + 4;
  if (questionEnd - 12 > 480) return; // حماية إضافية من تجاوز حجم بافر الرد تحت (حالة نظرية بس)
  uint16_t qtype = (buffer[pos] << 8) | buffer[pos + 1];

  IPAddress remoteIp = dnsUdp.remoteIP();
  uint16_t remotePort = dnsUdp.remotePort();

  uint8_t response[MAX_DNS_PACKET];
  int rlen = 0;
  response[rlen++] = buffer[0]; response[rlen++] = buffer[1]; // نفس رقم العملية (ID)

  if (qtype == 1) { // A record — رد بعنوان الجهاز
    response[rlen++] = 0x81; response[rlen++] = 0x80; // استجابة عادية، مفيش خطأ
    response[rlen++] = 0x00; response[rlen++] = 0x01; // QDCOUNT=1
    response[rlen++] = 0x00; response[rlen++] = 0x01; // ANCOUNT=1
    response[rlen++] = 0x00; response[rlen++] = 0x00; // NSCOUNT=0
    response[rlen++] = 0x00; response[rlen++] = 0x00; // ARCOUNT=0
    memcpy(response + rlen, buffer + 12, questionEnd - 12);
    rlen += (questionEnd - 12);
    response[rlen++] = 0xC0; response[rlen++] = 0x0C; // إشارة لاسم النطاق في السؤال (ضغط قياسي)
    response[rlen++] = 0x00; response[rlen++] = 0x01; // TYPE A
    response[rlen++] = 0x00; response[rlen++] = 0x01; // CLASS IN
    response[rlen++] = 0x00; response[rlen++] = 0x00; response[rlen++] = 0x00; response[rlen++] = 0x3C; // TTL=60 ثانية
    response[rlen++] = 0x00; response[rlen++] = 0x04; // طول البيانات = 4 بايت (IPv4)
    response[rlen++] = dnsResolveIP[0]; response[rlen++] = dnsResolveIP[1];
    response[rlen++] = dnsResolveIP[2]; response[rlen++] = dnsResolveIP[3];
  } else {
    // أي نوع تاني (AAAA وغيره) — NXDOMAIN فوري وصريح
    response[rlen++] = 0x81; response[rlen++] = 0x83; // استجابة، rcode=3 (NXDOMAIN)
    response[rlen++] = 0x00; response[rlen++] = 0x01; // QDCOUNT=1
    response[rlen++] = 0x00; response[rlen++] = 0x00; // ANCOUNT=0
    response[rlen++] = 0x00; response[rlen++] = 0x00;
    response[rlen++] = 0x00; response[rlen++] = 0x00;
    memcpy(response + rlen, buffer + 12, questionEnd - 12);
    rlen += (questionEnd - 12);
  }

  dnsUdp.beginPacket(remoteIp, remotePort);
  dnsUdp.write(response, rlen);
  dnsUdp.endPacket();
}

void startCaptivePortal() {
  ap_mode_active = true;

  // 🛑 إيقاف هوائي RFID لتقليل التداخل مع الـ Wi-Fi في وضع AP
  mfrc522.PCD_AntennaOff();
  Serial.println("📡 تم إيقاف هوائي RFID (وضع الإعداد).");

  // 📶 رفع قدرة إرسال الـ Wi-Fi إلى أقصى حد (19.5 dBm) لتحسين التغطية رغم التداخل
  WiFi.setTxPower(WIFI_POWER_19_5dBm);

  WiFi.disconnect(true, true);
  delay(200);
  WiFi.mode(WIFI_AP_STA);
  delay(200);

  String apName = String(AP_SSID_PREFIX);
  bool apStarted = WiFi.softAP(apName.c_str(), AP_PASSWORD);
  delay(200);

  // ✅ (فِكس: تابلت/موبايلات معيّنة بتتصل بنقطة الوصول وتاخد IP صح، لكن صفحة الإعداد
  // مبتفتحش ولا حتى بتوصلها أي طلب فحص خالص) قبل السطر ده، إعدادات الـIP/الـDNS بتاعة
  // نقطة الوصول كانت بتعتمد على القيم الافتراضية اللي أي محاولة اتصال سابقة بشبكة حقيقية
  // (WiFi.disconnect فوق، قبل التحويل لوضع AP_STA) ممكن تكون سابت أثر منها في إعدادات
  // الشبكة الداخلية (زي عناوين DNS بتاعة الراوتر الحقيقي، اللي بقت غير قابلة للوصول
  // خالص دلوقتي). بعض الأجهزة (زي آيفون) بترجع تستخدم عنوان الـgateway كـDNS احتياطي لو
  // الـDNS المُعلن مش راد، لكن أجهزة تانية (لاحظنا كده تحديدًا مع تابلت أندرويد سامسونج)
  // بتلتزم بس بالـDNS المُعلن رسميًا عن طريق DHCP ومترجعش تجرب الـgateway خالص — لو ده
  // فيه أثر قديم مش صحيح، الجهاز بيفشل يعمل أي DNS lookup ومبيوصلناش أي طلب خالص، حتى لو
  // اتوصل بنقطة الوصول وأخد IP سليم. السطر ده بيجبر إعادة ضبط الـIP/الـgateway صراحة على
  // نقطة الوصول نفسها فور نجاحها، عشان سيرفر الـDHCP يعلن DNS = عنوان الجهاز نفسه بشكل
  // نضيف ومضمون، من غير أي أثر قديم محتمل
  IPAddress fixedApIP(192, 168, 4, 1);
  WiFi.softAPConfig(fixedApIP, fixedApIP, IPAddress(255, 255, 255, 0));
  delay(200);

  IPAddress apIP = WiFi.softAPIP();

  if (apStarted) {
    Serial.println("✅ WiFi.softAP() نجحت");
  } else {
    Serial.println("❌ WiFi.softAP() فشلت! (جرّبي إعادة تشغيل الجهاز)");
  }
  Serial.println("   عنوان الـIP بتاع نقطة الوصول: " + apIP.toString());

  startCustomDnsServer(apIP);

  webServer.on("/", handleRoot);
  webServer.on("/save", HTTP_POST, handleSave);
  webServer.onNotFound(handleNotFound);
  webServer.begin();

  Serial.println("\n📡 === وضع الإعداد مفعّل ===");
  Serial.println("   اسم الشبكة: " + apName);
  Serial.println("   كلمة المرور: " + String(AP_PASSWORD));
  Serial.println("   العنوان: http://" + apIP.toString());
  sendStatus("AP_MODE_ACTIVE:" + apName);

  // ✅ لمبة LED_BLUE بتنور ثابتة طول ما وضع الإعداد شغّال — أول استخدام "حالة ثابتة" لها،
  // برضو من غير أي تغيير في مكانها أو في استخدامها الطبيعي (الوميض الخاطف عند نجاح
  // الإرسال/الـ Ping) خارج وضع الإعداد ده بالذات
  digitalWrite(LED_BLUE, HIGH);
}

void tryBackgroundReconnect() {
  if (wifi_ssid.length() == 0) return;

  // ✅ (فِكس: صفحة الإعداد بتتأخر جداً أو مابتفتحش لوحدها) لو فيه جهاز متصل بنقطة الوصول
  // دلوقتي (المستخدم بيحاول يظبط الإعدادات فعلاً)، منحاولش نتصل بالشبكة القديمة خالص —
  // WiFi.begin() بيجبر نقطة الوصول تتنقل لقناة (channel) الشبكة اللي بيحاول يتصل بيها، وده
  // بيفصل أي جهاز متصل بالـAP فجأة لحد ما يرجع يتصل تاني، وده بالظبط اللي كان بيخلي صفحة
  // الإعداد تتأخر جداً أو ماتفتحش لوحدها لو المستخدم بيحاول يظبطها في نفس لحظة محاولة
  // الاتصال الخلفية دي (بتتكرر كل 30 ثانية طول ما وضع الإعداد شغّال)
  if (WiFi.softAPgetStationNum() > 0) {
    Serial.println("⏸️ فيه جهاز متصل بنقطة الوصول دلوقتي — تأجيل محاولة الاتصال الخلفية");
    return;
  }

  Serial.println("🔄 محاولة اتصال في الخلفية بالشبكة المحفوظة...");
  WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 8000) {
    delay(200);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("✅ رجع الاتصال بالشبكة القديمة! جاري إغلاق وضع الإعداد...");
    stopCustomDnsServer();
    webServer.close();
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    ap_mode_active = false;
    wifi_connected = true;
    digitalWrite(LED_BLUE, LOW);
    sendStatus("WIFI_RECONNECTED_AUTO");

    // ✅ عند نجاح الاتصال في الخلفية، نعيد تشغيل هوائي RFID
    mfrc522.PCD_AntennaOn();
    Serial.println("📡 تم إعادة تشغيل هوائي RFID (اتصال خلفي ناجح).");
  } else {
    Serial.println("⏳ لسه مفيش اتصال، هنجرّب تاني بعد شوية (وضع الإعداد لسه شغّال)");
  }
}

// =========================================================
// 🔁 النواة 1: قراءة الكروت
// =========================================================
void loop() {
  // ✅ (إضافة) وضع الإعداد شغّال؟ نعالج طلبات صفحة الإعداد بس، ومفيش أي قراءة كروت
  // (الهوائي مقفول أصلاً في الحالة دي)
  if (ap_mode_active) {
    processCustomDnsRequests();
    webServer.handleClient();

    // ✅ (رجوع عن تعديل سابق) كنا نقلنا النداء ده لتاسك منفصلة على النواة التانية ظنًا إنه
    // هو سبب تأخّر/عدم فتح صفحة الإعداد تلقائيًا — لكن اتأكد إن الكود الأصلي (النداء هنا
    // مباشرة) كان شغّال تمام قبل أي تعديل، وإن المشكلة الحقيقية حاجة تانية تمامًا (حاجة في
    // نظام الموبايل نفسه، مش في الكود). رجّعناه هنا زي ما كان بالظبط تفاديًا لأي أثر جانبي
    // غير متوقع من تشغيله في تاسك مستقلة (زي ضغط إضافي على الذاكرة أو تعارض بين النواتين
    // على واي فاي)، وسبنا بس إضافة الحماية الوحيدة المضمون إنها مفيدة (تحت في
    // tryBackgroundReconnect نفسها): تأجيل المحاولة تمامًا لو فيه جهاز متصل بنقطة الوصول دلوقتي
    if (millis() - lastBackgroundRetry > BACKGROUND_RETRY_INTERVAL) {
      lastBackgroundRetry = millis();
      tryBackgroundReconnect();
    }

    delay(2);
    return;
  }

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    loopSerial();
    delay(10);
    return;
  }

  CardData scannedCard;
  String uidString = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uidString += "0";
    uidString += String(mfrc522.uid.uidByte[i], HEX);
  }
  uidString.toUpperCase();
  uidString.toCharArray(scannedCard.uid, 16);

  Serial.println("⚡ كارت: " + uidString);

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  if (xQueueSend(cardQueue, &scannedCard, 0) == pdPASS) {
    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(BUZZER, HIGH);
    delay(80);
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(BUZZER, LOW);
  } else {
    blinkLED(LED_RED, 2, 400, true);
  }
  loopSerial();
  delay(10);
}

// =========================================================
// 🌐 رفع البيانات (النواة 0)
// =========================================================
void uploadTask(void * pvParameters) {
  CardData cardToUpload;
  while (true) {
    // ✅ (إضافة) وضع الإعداد شغّال؟ ما نحاولش نتصل أو نبعت حاجة، هوائي القراءة مقفول
    // أصلاً فالطابور المفروض يفضل فاضي، بس ده حماية إضافية بسيطة
    if (ap_mode_active) {
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    if (xQueueReceive(cardQueue, &cardToUpload, portMAX_DELAY) == pdPASS) {
      String uid = String(cardToUpload.uid);
      if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
        if (WiFi.status() != WL_CONNECTED) {
          xQueueSend(cardQueue, &cardToUpload, 0);
          vTaskDelay(pdMS_TO_TICKS(2000));
          continue;
        }
      }
      sendToMasterScan(uid);
      vTaskDelay(pdMS_TO_TICKS(500));
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// =========================================================
// 📡 إرسال UID (عن طريق دالة موثّقة بمفتاح الجهاز، مش كتابة مباشرة في الجدول)
// =========================================================
void sendToMasterScan(String uid) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/submit-master-card-scan";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  StaticJsonDocument<150> doc;
  doc["uid"] = uid;
  doc["deviceSecret"] = DEVICE_SECRET;
  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    Serial.println("✅ تم إرسال الكارت (موثّق)");
    digitalWrite(LED_BLUE, HIGH);
    delay(50);
    digitalWrite(LED_BLUE, LOW);
  } else if (httpCode == 401) {
    Serial.println("⛔ مفتاح جهاز الماستر غلط - راجع DEVICE_SECRET");
    blinkLED(LED_RED, 4, 250, true);
  } else {
    Serial.println("❌ فشل إرسال الكارت: " + String(httpCode));
    blinkLED(LED_RED, 2, 200, false);
  }
  http.end();
}


// =========================================================
// 📡 نبضات القلب (Ping) مع إرسال الحالة
// =========================================================
void pingTask(void * pvParameters) {
  while (true) {
    vTaskDelay(pdMS_TO_TICKS(PING_INTERVAL));

    // ✅ (إضافة) وضع الإعداد شغّال؟ نتجاهل الـ Ping تماماً — عشان منتعارضش مع لمبة
    // LED_BLUE الثابتة اللي بتبين إن وضع الإعداد شغّال دلوقتي
    if (ap_mode_active) continue;

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      String url = String(SUPABASE_URL) + "/rest/v1/";
      http.begin(url);
      http.addHeader("Authorization", "Bearer " + String(ANON_KEY));
      http.addHeader("apikey", String(ANON_KEY));
      http.setTimeout(3000);
      int code = http.GET();

      if (code > 0) {
        server_online = true;
        digitalWrite(LED_BLUE, HIGH);
        delay(100);
        digitalWrite(LED_BLUE, LOW);
        digitalWrite(LED_READY, HIGH);
        if (!lastStatusSent) {
          sendStatus("SERVER_ONLINE");
          lastStatusSent = true;
        }
      } else {
        server_online = false;
        digitalWrite(LED_READY, LOW);
        blinkLED(LED_RED, 1, 200, false);
        if (lastStatusSent) {
          sendStatus("SERVER_OFFLINE");
          lastStatusSent = false;
        }
      }
      http.end();
    } else {
      wifi_connected = false;
      server_online = false;
      digitalWrite(LED_READY, LOW);
      digitalWrite(LED_READY, HIGH);
      delay(100);
      digitalWrite(LED_READY, LOW);
      delay(100);
      if (lastStatusSent) {
        sendStatus("WIFI_DISCONNECTED");
        lastStatusSent = false;
      }
    }
  }
}

// =========================================================
// 💻 معالجة الأوامر التسلسلية
// =========================================================
void processSerialCommand(String command) {
  command.trim();

  if (command.startsWith("GET_CONFIG")) {
    Serial.println("=== CONFIG_START ===");
    Serial.println("SSID:" + wifi_ssid);
    Serial.println("PASS:" + wifi_password);
    Serial.println("=== CONFIG_END ===");
    return;
  }

  if (command.startsWith("SET_CONFIG:")) {
    String data = command.substring(11);
    int separator = data.indexOf('|');
    if (separator == -1) {
      Serial.println("❌ صيغة غير صحيحة. استخدم: SET_CONFIG:SSID|PASSWORD");
      return;
    }
    String newSSID = data.substring(0, separator);
    String newPassword = data.substring(separator + 1);
    if (newSSID.length() == 0) {
      Serial.println("❌ SSID لا يمكن أن يكون فارغاً");
      return;
    }
    if (saveWiFiConfig(newSSID, newPassword)) {
      Serial.println("✅ تم حفظ الإعدادات. جاري إعادة الاتصال...");
      connectWiFi();
    }
    return;
  }

  if (command.startsWith("PING")) {
    Serial.println("PONG");
    sendStatus("PONG_RESPONSE");
    return;
  }

  if (command.startsWith("RESET_CONFIG")) {
    if (SPIFFS.begin(true)) {
      if (SPIFFS.remove("/wifi.json")) {
        Serial.println("✅ تم حذف الإعدادات. أعد تشغيل الجهاز.");
        wifi_ssid = "";
        wifi_password = "";
      } else {
        Serial.println("❌ فشل حذف الإعدادات");
      }
    }
    return;
  }

  Serial.println("❓ أمر غير معروف: " + command);
  Serial.println("   الأوامر: GET_CONFIG, SET_CONFIG:SSID|PASS, RESET_CONFIG, PING");
}

// =========================================================
// 🔄 حلقة قراءة الأوامر التسلسلية
// =========================================================
void loopSerial() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    processSerialCommand(command);
  }
}

// =========================================================
// 🚀 دالة التشغيل الأولى
// =========================================================
void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();

  pinMode(LED_READY, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  
  digitalWrite(LED_READY, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_BLUE, LOW);
  digitalWrite(BUZZER, LOW);

  loadWiFiConfig();

  if (wifi_ssid.length() > 0) {
    connectWiFi();
  } else {
    Serial.println("⚠️ لا توجد إعدادات واي فاي محفوظة. جاري تفعيل وضع الإعداد...");
  }

  // ✅ (إضافة) لو مفيش إعدادات محفوظة أصلاً، أو الاتصال بالشبكة المحفوظة فشل، يفتح
  // وضع الإعداد (Access Point) تلقائياً بدل ما الجهاز يقف عاطل — بديل عن أمر SET_CONFIG
  // اليدوي القديم (اللي لسه شغّال برضو كخيار احتياطي عن طريق الـ Serial)
  if (WiFi.status() != WL_CONNECTED) {
    if (wifi_ssid.length() > 0) {
      Serial.println("⚠️ فشل الاتصال بالشبكة المحفوظة. جاري تفعيل وضع الإعداد...");
    }
    startCaptivePortal();
  }

  cardQueue = xQueueCreate(20, sizeof(CardData));

  xTaskCreatePinnedToCore(uploadTask, "UploadTask", 8192, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(pingTask, "PingTask", 4096, NULL, 1, NULL, 0);

  Serial.println("\n✅ فَصلي - جهاز استقبال كروت المخزون (الماستر) جاهز.");
  Serial.println("📡 أوامر Serial: GET_CONFIG, SET_CONFIG:SSID|PASS, RESET_CONFIG, PING");
}
