// sw.js — تم إلغاء استخدامه بالكامل
// ============================================
// بعد تكرار مشاكل تعليق نسخ قديمة من الكود على أجهزة المستخدمين رغم كل محاولات إصلاح
// استراتيجية التخزين (كاش أول، بعدين إنترنت أول)، القرار النهائي: عامل الخدمة (Service
// Worker) ده نفسه بقى مصدر مخاطرة غير متوقعة أكتر ما بيفيد (خصوصًا إن دعم WebView
// بتاع أندرويد لعمال الخدمة كان دايمًا أقل ثباتًا من متصفح حقيقي). الملف ده دلوقتي
// "مفتاح إيقاف ذاتي": أي جهاز عنده نسخة قديمة مسجّلة هيحمّل الملف ده، يشوف إنه مختلف
// عن اللي عنده، فيثبّته وينفّذ activate بتاعه — اللي بيمسح كل الكاش القديم ويلغي تسجيل
// نفسه بالكامل، فمفيش عامل خدمة هيفضل شغال أصلاً بعد كده على أي جهاز.
// ============================================

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
