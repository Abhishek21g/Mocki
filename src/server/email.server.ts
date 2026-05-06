import { Resend } from "resend";

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

const FROM =
  process.env.RESEND_FROM_EMAIL?.trim() ?? "Mocki <onboarding@resend.dev>";

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping welcome email");
    return;
  }

  const firstName = name?.split(" ")[0] || "there";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to Mocki</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <span style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#76b900;">mocki</span>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="background:#111;border:1px solid #1a1a1a;border-radius:16px;padding:40px;">
              <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#fff;">
                Welcome, ${firstName} 👋
              </h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#a3a3a3;">
                You're in. Mocki runs a real 3-person AI panel interview — Coordinator, Interviewer,
                Evaluator — all tailored to your resume and target role in real time.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;width:100%;">
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #1a1a1a;">
                    <span style="color:#76b900;font-weight:600;">✓</span>
                    <span style="color:#d4d4d4;margin-left:10px;font-size:14px;">Adaptive panel that responds to your answers</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #1a1a1a;">
                    <span style="color:#76b900;font-weight:600;">✓</span>
                    <span style="color:#d4d4d4;margin-left:10px;font-size:14px;">Full debrief + score after every session</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #1a1a1a;">
                    <span style="color:#76b900;font-weight:600;">✓</span>
                    <span style="color:#d4d4d4;margin-left:10px;font-size:14px;">Panel learns from your past sessions</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <span style="color:#76b900;font-weight:600;">✓</span>
                    <span style="color:#d4d4d4;margin-left:10px;font-size:14px;">Powered by NVIDIA Nemotron</span>
                  </td>
                </tr>
              </table>

              <a href="https://mocki.dev"
                style="display:inline-block;background:#76b900;color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;text-decoration:none;">
                Start your first interview →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;font-size:12px;color:#525252;line-height:1.6;">
              Built by Abhishek, Murali, Mithun & Ross at BeaverHacks 2026.<br/>
              <a href="https://mocki.dev/about" style="color:#525252;">About</a>
              &nbsp;·&nbsp;
              <a href="https://mocki.dev/about" style="color:#525252;">Feedback</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Welcome to Mocki 🎤",
    html,
  });

  if (error) {
    console.error("[email] Failed to send welcome email:", error);
  } else {
    console.log(`[email] Welcome email sent to ${email}`);
  }
}
