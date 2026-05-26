import nodemailer from 'nodemailer';

const APK_URL = process.env.DZARYX_APK_URL ?? 'https://expo.dev/artifacts/eas/aAheefwby5r6DMZo9WEnuo.apk';
const APP_URL = 'https://kouider213.github.io/ibrahim/';

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT ?? '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });
}

export async function sendVerificationCode(to: string, code: string, action: string): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  await createTransport().sendMail({
    from: `"Dzaryx" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to,
    subject: `🔐 Code de vérification Dzaryx — ${code}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;">
<div style="max-width:500px;margin:0 auto;padding:40px 20px;text-align:center;">
  <div style="font-size:40px;margin-bottom:16px;">🔐</div>
  <div style="font-family:monospace;font-size:20px;font-weight:900;color:#00d4ff;letter-spacing:0.3em;margin-bottom:24px;">DZARYX</div>
  <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:24px;">Code de confirmation pour : <strong style="color:#fff;">${action}</strong></div>
  <div style="background:rgba(0,212,255,0.08);border:2px solid rgba(0,212,255,0.3);border-radius:16px;padding:24px;margin-bottom:24px;">
    <div style="font-family:monospace;font-size:42px;font-weight:900;color:#00d4ff;letter-spacing:0.4em;">${code}</div>
  </div>
  <div style="font-size:13px;color:rgba(255,255,255,0.35);">Ce code expire dans <strong style="color:rgba(255,255,255,0.6);">15 minutes</strong>.<br>Si vous n'avez pas fait cette demande, ignorez cet email.</div>
</div></body></html>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  await createTransport().sendMail({
    from: `"Dzaryx" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to,
    subject: `🔑 Réinitialisation de votre mot de passe Dzaryx`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;">
<div style="max-width:500px;margin:0 auto;padding:40px 20px;text-align:center;">
  <div style="font-size:40px;margin-bottom:16px;">🔑</div>
  <div style="font-family:monospace;font-size:20px;font-weight:900;color:#00d4ff;letter-spacing:0.3em;margin-bottom:24px;">DZARYX</div>
  <div style="font-size:14px;color:rgba(255,255,255,0.6);margin-bottom:24px;">Vous avez demandé à réinitialiser votre mot de passe.</div>
  <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#00d4ff;color:#000;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px;margin-bottom:24px;">
    🔐 Réinitialiser mon mot de passe
  </a>
  <div style="font-size:12px;color:rgba(255,255,255,0.3);">Ce lien expire dans <strong>1 heure</strong>.<br>Si vous n'avez pas fait cette demande, ignorez cet email.</div>
</div></body></html>`,
  });
}

export async function sendChangeConfirmedEmail(to: string, what: string): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  await createTransport().sendMail({
    from: `"Dzaryx" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to,
    subject: `✅ Modification confirmée — ${what}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;">
<div style="max-width:500px;margin:0 auto;padding:40px 20px;text-align:center;">
  <div style="font-size:40px;margin-bottom:16px;">✅</div>
  <div style="font-family:monospace;font-size:20px;font-weight:900;color:#00d4ff;letter-spacing:0.3em;margin-bottom:24px;">DZARYX</div>
  <div style="font-size:15px;color:rgba(255,255,255,0.8);margin-bottom:12px;">Votre <strong style="color:#00d4ff;">${what}</strong> a été modifié avec succès.</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.35);">Si vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement.</div>
</div></body></html>`,
  });
}

export async function sendRegistrationEmail(to: string, aiName: string, businessName: string): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[email] SMTP non configuré — email ignoré pour ${to}`);
    return;
  }

  await createTransport().sendMail({
    from:    `"Dzaryx" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to,
    subject: `🤖 Bienvenue sur Dzaryx — ${aiName} est prêt pour ${businessName} !`,
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#ffffff;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">

  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:56px;margin-bottom:12px;">🎉</div>
    <div style="font-family:monospace;font-size:24px;font-weight:900;color:#00d4ff;letter-spacing:0.3em;">DZARYX</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-top:6px;">Votre assistant IA est prêt</div>
  </div>

  <div style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);border-radius:16px;padding:24px;margin-bottom:24px;">
    <div style="font-size:16px;font-weight:600;color:#00d4ff;margin-bottom:12px;">✅ Compte créé avec succès !</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;">
      <strong style="color:#ffffff;">${aiName}</strong>, votre assistant IA personnel, est maintenant disponible pour <strong style="color:#ffffff;">${businessName}</strong>.
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
    <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:16px;">📱 Installer l'application</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;margin-bottom:16px;">
      Pour les notifications push, le mode vocal mains-libres et les alarmes :
    </div>
    <a href="${APK_URL}"
       style="display:inline-block;padding:12px 24px;background:#00d4ff;color:#000;border-radius:10px;font-weight:700;text-decoration:none;font-size:14px;">
      ⬇️ Télécharger l'APK Android
    </a>
    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:12px;">
      Téléchargez → ouvrez le fichier → autorisez les sources inconnues → installez → connectez-vous avec <strong>${to}</strong>
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
    <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:12px;">🚀 Comment démarrer</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.8;">
      1. Ouvrez <a href="${APP_URL}" style="color:#00d4ff;">l'application Dzaryx</a><br>
      2. Connectez-vous avec <strong style="color:#00d4ff;">${to}</strong><br>
      3. Votre assistant connaît déjà votre secteur<br>
      4. Dites lui ce dont vous avez besoin !
    </div>
  </div>

  <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:16px;padding:20px;margin-bottom:24px;">
    <div style="font-size:13px;font-weight:600;color:rgba(124,58,237,0.9);margin-bottom:8px;">✨ Passez à Pro pour plus de puissance</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.45);line-height:1.5;">
      Messages illimités · Briefing quotidien · Stats avancées · Notifications push · Support prioritaire<br>
      <strong style="color:rgba(124,58,237,0.8);">2 900 DA / mois</strong> — depuis l'onglet Compte dans votre app.
    </div>
  </div>

  <div style="text-align:center;font-size:12px;color:rgba(255,255,255,0.25);margin-top:32px;">
    Dzaryx — Assistant IA pour votre business<br>
    Fik Conciergerie Oran · <a href="mailto:${process.env.SMTP_FROM ?? process.env.SMTP_USER}" style="color:rgba(255,255,255,0.25);">Support</a>
  </div>

</div>
</body>
</html>`,
  });
}

export async function sendWelcomeEmail(to: string, plan: string, planLabel: string): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[email] SMTP non configuré — email ignoré pour ${to}`);
    return;
  }

  const emoji = plan === 'enterprise' ? '👑' : '✨';
  const planDisplay = plan === 'enterprise' ? 'Enterprise' : 'Pro';

  await createTransport().sendMail({
    from:    `"Dzaryx" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`,
    to,
    subject: `${emoji} Bienvenue sur Dzaryx ${planDisplay} — votre assistant est prêt !`,
    html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#ffffff;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">

  <div style="text-align:center;margin-bottom:32px;">
    <div style="font-size:48px;margin-bottom:12px;">🤖</div>
    <div style="font-family:monospace;font-size:24px;font-weight:900;color:#00d4ff;letter-spacing:0.3em;">DZARYX</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-top:6px;">${planLabel}</div>
  </div>

  <div style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);border-radius:16px;padding:24px;margin-bottom:24px;">
    <div style="font-size:16px;font-weight:600;color:#00d4ff;margin-bottom:12px;">${emoji} Plan ${planDisplay} activé !</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;">
      Votre assistant Dzaryx est en mode ${planDisplay}. Accès complet à toutes les fonctionnalités.
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
    <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:16px;">📱 Installer l'application Dzaryx</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.6;margin-bottom:16px;">
      Installez l'app native pour les notifications push, le mode vocal mains-libres et les alarmes :
    </div>
    <a href="${APK_URL}"
       style="display:inline-block;padding:12px 24px;background:#00d4ff;color:#000;border-radius:10px;font-weight:700;text-decoration:none;font-size:14px;">
      ⬇️ Télécharger l'APK Android
    </a>
    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:12px;">
      Téléchargez → ouvrez le fichier APK → autorisez les sources inconnues → installez → connectez-vous.
    </div>
  </div>

  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
    <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:12px;">🚀 Premiers pas</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.8;">
      1. Ouvrez <a href="${APP_URL}" style="color:#00d4ff;">Dzaryx</a> ou l'application Android<br>
      2. Connectez-vous avec <strong style="color:#00d4ff;">${to}</strong><br>
      3. Parlez à votre assistant — il connaît votre business<br>
      4. Configurez votre profil dans l'onglet <strong>Compte</strong>
    </div>
  </div>

  <div style="text-align:center;font-size:12px;color:rgba(255,255,255,0.25);margin-top:32px;">
    Dzaryx — Assistant IA pour votre business<br>
    Fik Conciergerie Oran
  </div>

</div>
</body>
</html>`,
  });
}
