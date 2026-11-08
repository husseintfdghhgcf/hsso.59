# لوحة تقييم الطلاب — جاهزة للنشر على Vercel (Node.js + PostgreSQL)

> Vercel لا يشغّل PHP رسمياً، ولهذا المشروع يعمل بـ **Node.js (Express)** كدالة Serverless،
> والقاعدة **PostgreSQL خارجية (Neon)**، والواجهة HTML/CSS/JS صافية.

## ما الذي تغيّر عن نسخة MySQL

| الموضوع | قبل | الآن |
|---|---|---|
| قاعدة البيانات | MySQL محلي | PostgreSQL خارجي عبر `DATABASE_URL` |
| الجلسات | ذاكرة السيرفر | **كوكي موقّع (HMAC)** — يعمل مع Serverless |
| الإعدادات | `.env` بعدة متغيرات DB | `DATABASE_URL` + `SESSION_SECRET` فقط |
| صفحات الأدمن/الطالب | ملفات ثابتة | داخل `private/` وتُرسل فقط بعد فحص الصلاحية |
| صفحات الدخول والـCSS/JS | — | `public/` تُخدم من CDN الخاص بـVercel |

## الإعداد خطوة بخطوة

### 1) قاعدة البيانات (Neon عبر Vercel)
1. في لوحة Vercel: **Storage → Create Database → Neon (Postgres)** واربطها بالمشروع.
   سيضيف Vercel المتغير `DATABASE_URL` (و`POSTGRES_URL`) تلقائياً.
   (أو أنشئ قاعدة على neon.tech / Supabase وانسخ رابط الاتصال.)

### 2) التجهيز على جهازك (مرة واحدة)
```bash
npm install
cp .env.example .env        # ويندوز: copy .env.example .env
```
عدّل `.env`: ضع `DATABASE_URL` الحقيقي، وولّد `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
ثم:
```bash
npm run db:init                                   # ينشئ الجداول + البيانات التجريبية
npm run admin:create -- admin كلمة_مرور_قوية "اسم المشرف"
```

**عندك بيانات حقيقية في MySQL القديم؟** انقلها (تحافظ على الـids وكلمات المرور):
```bash
MYSQL_URL="mysql://user:pass@host:3306/student_dashboard" npm run db:migrate-from-mysql
```
(ويندوز PowerShell: `$env:MYSQL_URL="..."; npm run db:migrate-from-mysql`)
> يمسح البيانات التجريبية ويضع بياناتك مكانها. أنشئ حساب المشرف بعدها إذا لم يكن منقولاً.

### 3) التجربة محلياً
```bash
npm start                    # http://localhost:3000
npm test                     # اختبار وحدة الجلسات
ADMIN_USER=admin ADMIN_PASS='كلمتك' npm run smoke
```

### 4) النشر على Vercel
1. ارفع المشروع إلى GitHub ثم **Add New → Project → Import** (Framework: *Other*، بدون Build Command).
   أو بالـCLI: `npm i -g vercel && vercel --prod`.
2. **Settings → Environment Variables** أضف:
   - `SESSION_SECRET` = القيمة الطويلة العشوائية (Production + Preview)
   - `DATABASE_URL` (إذا لم يضفها تكامل Neon تلقائياً)
   - اختيارياً: `SESSION_TIMEOUT`, `MAX_FAILED_LOGINS`, `LOCKOUT_MINUTES`
3. Deploy، ثم اختبر الموقع المنشور:
```bash
BASE_URL=https://your-app.vercel.app ADMIN_USER=admin ADMIN_PASS='كلمتك' npm run smoke
```

## ماذا يختبر `npm run smoke`
كل الصفحات (الرئيسية، دخول الأدمن/الطالب، CSS/JS) + حماية الصفحات بدون دخول + دخول الأدمن (خطأ/صح/بدون CSRF) +
**إضافة** مجموعة وطالب + رفض المكرر والدرجات الخارجة عن 0–100 + تعديل سريع (±) مع الحدود + **تعديل** كامل +
البحث والفلترة + حماية حذف مجموعة فيها طلاب + دخول الطالب وعزل بياناته (403 على API الأدمن) +
**حذف** الطالب والمجموعة + تسجيل الخروج. يحذف بيانات الاختبار (`TEST-...`) في النهاية.

## الأمان
- Prepared statements في كل الاستعلامات (`$1, $2 ...`)، وbcrypt لكلمات المرور (هاشات MySQL القديمة تعمل مباشرة).
- الكوكي: `HttpOnly` + `SameSite=Lax` + `Secure` على HTTPS، خمول ساعتين، وحد أقصى 7 أيام.
- CSRF بهيدر `X-CSRF-Token` لكل عملية تعديل وتسجيل دخول/خروج.
- الأدمن يُعاد التحقق منه في القاعدة عند كل طلب، والطالب يرى بياناته فقط (الـid من الجلسة الموقّعة).
- منع التخمين: 8 محاولات فاشلة / 15 دقيقة لكل IP لكل بوابة (جدول `login_logs`).

## ملاحظات
- الجلسات بلا حالة على السيرفر: تغيير `SESSION_SECRET` يُسجّل خروج الجميع. ولا يمكن إبطال كوكي واحد قبل انتهائه
  (لكن حذف الأدمن/الطالب من القاعدة يوقف وصوله فوراً).
- الأسماء غير حساسة لحالة الأحرف (`lower(name)`) مثل MySQL السابق.
- إذا فضّلت MySQL بدل PostgreSQL فالتغيير يشمل `src/db.js` و`src/repository.js` و`src/auth.js` فقط.
