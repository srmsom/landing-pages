const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest'); // پکیج رسمی ارتباط با گیت‌هاب

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات گیت‌هاب (این اطلاعات را با توکن و ریپازیتوری خودتان پر کنید)
const octokit = new Octokit({
    auth: 'YOUR_GITHUB_PERSONAL_ACCESS_TOKEN' // توکن دسترسی شخصی گیت‌هاب
});
const GITHUB_OWNER = 'YOUR_GITHUB_USERNAME';  // نام کاربری گیت‌هاب شما
const GITHUB_REPO = 'YOUR_REPO_NAME';         // نام مخزن شما (مثلا qod-landing)

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// سرو کردن فایل‌های استاتیک (مثل پوشه order برای فرم مشتری)
app.use('/order', express.static(path.join(__dirname, 'order')));

// مسیر پردازش سفارش
app.post('/api/create-landing', async (req, res) => {
    try {
        const { templateId, slug, title, bio, ctaText, ctaLink } = req.body;

        // ۱. اعتبارسنجی اولیه اسلاگ (فقط حروف انگلیسی، اعداد و خط تیره)
        const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!cleanSlug) {
            return res.status(400).json({ success: false, message: 'Invalid slug format.' });
        }

        // ۲. بررسی تکراری نبودن اسلاگ از روی لیست رزرو شده‌ها
        const slugsFilePath = path.join(__dirname, 'db', 'taken_slugs.json');
        let takenSlugs = [];
        if (fs.existsSync(slugsFilePath)) {
            takenSlugs = JSON.parse(fs.readFileSync(slugsFilePath, 'utf8'));
        }

        if (takenSlugs.includes(cleanSlug)) {
            return res.status(400).json({ success: false, message: 'This URL slug is already taken. Please choose another one.' });
        }

        // ۳. خواندن فایل قالب مربوطه از پوشه templates
        const templatePath = path.join(__dirname, 'templates', templateId, 'index.html');
        if (!fs.existsSync(templatePath)) {
            return res.status(400).json({ success: false, message: 'Selected template does not exist.' });
        }
        let templateContent = fs.readFileSync(templatePath, 'utf8');

        // ۴. جایگزینی متغیرها با داده‌های مشتری
        const avatarInitial = title ? title.charAt(0).toUpperCase() : 'Q';
        const finalHtml = templateContent
            .replace(/{{TITLE}}/g, title || '')
            .replace(/{{BIO}}/g, bio || '')
            .replace(/{{CTA_TEXT}}/g, ctaText || 'Click Here')
            .replace(/{{CTA_LINK}}/g, ctaLink || '#')
            .replace(/{{AVATAR_INITIAL}}/g, avatarInitial);

        // ۵. ارسال و کامیت فایل جدید از طریق GitHub API (در پوشه اختصاصی مشتری)
        const filePathInRepo = `${cleanSlug}/index.html`;
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: filePathInRepo,
            message: `Auto-generated landing page for: ${cleanSlug}`,
            content: Buffer.from(finalHtml).toString('base64'),
            branch: 'main' // یا master بسته به نام برنچ شما
        });

        // ۶. ثبت اسلاگ در لیست تکراری‌ها
        takenSlugs.push(cleanSlug);
        if (!fs.existsSync(path.join(__dirname, 'db'))) {
            fs.mkdirSync(path.join(__dirname, 'db'));
        }
        fs.writeFileSync(slugsFilePath, JSON.stringify(takenSlugs, null, 2));

        // ۷. پاسخ موفقیت‌آمیز به مشتری (هدایت به صفحه پرداخت یا نمایش لینک نهایی)
        res.json({
            success: true,
            message: 'Landing page created successfully!',
            url: `https://qod.ir/${cleanSlug}/`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error during generation.', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`QOD Server is running on port ${PORT}`);
});
