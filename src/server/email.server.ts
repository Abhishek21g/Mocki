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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Welcome to Mocki</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:48px 20px 32px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

        <!-- ── HERO CARD ─────────────────────────────────────── -->
        <tr>
          <td style="border-radius:20px;overflow:hidden;background:linear-gradient(160deg,#0f1a00 0%,#0a0a0a 50%,#0d1f00 100%);border:1px solid #1f2e00;padding:0;">

            <!-- Green glow bar -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="height:4px;background:linear-gradient(90deg,#76b900,#4d7a00,#76b900);"></td>
              </tr>
            </table>

            <!-- Top section -->
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 40px 0;">
              <tr>
                <td>
                  <!-- Logo -->
                  <div style="margin-bottom:28px;">
                    <span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#76b900;">mocki</span>
                    <span style="margin-left:10px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#4d7a00;vertical-align:middle;">AI Interviews</span>
                  </div>

                  <!-- Headline -->
                  <h1 style="margin:0 0 8px;font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">
                    You're in, ${firstName}. 🎤
                  </h1>
                  <p style="margin:0 0 32px;font-size:16px;line-height:1.7;color:#737373;">
                    Your AI panel is ready. 3 interviewers, your actual resume, real follow-ups.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Panel showcase -->
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 40px 32px;">
              <tr>
                <!-- Coordinator -->
                <td width="30%" style="padding-right:8px;">
                  <div style="background:rgba(118,185,0,0.07);border:1px solid rgba(118,185,0,0.2);border-radius:12px;padding:16px 12px;text-align:center;">
                    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#76b900,#3a5c00);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#000;line-height:44px;">C</div>
                    <div style="font-size:12px;font-weight:700;color:#76b900;margin-bottom:3px;">Coordinator</div>
                    <div style="font-size:11px;color:#525252;line-height:1.4;">Plans every move</div>
                  </div>
                </td>
                <!-- Interviewer -->
                <td width="30%" style="padding:0 4px;">
                  <div style="background:rgba(118,185,0,0.1);border:1px solid rgba(118,185,0,0.35);border-radius:12px;padding:16px 12px;text-align:center;">
                    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#76b900,#3a5c00);margin:0 auto 10px;line-height:44px;font-size:18px;font-weight:800;color:#000;text-align:center;">I</div>
                    <div style="font-size:12px;font-weight:700;color:#76b900;margin-bottom:3px;">Interviewer</div>
                    <div style="font-size:11px;color:#525252;line-height:1.4;">Adapts in real time</div>
                  </div>
                </td>
                <!-- Evaluator -->
                <td width="30%" style="padding-left:8px;">
                  <div style="background:rgba(118,185,0,0.07);border:1px solid rgba(118,185,0,0.2);border-radius:12px;padding:16px 12px;text-align:center;">
                    <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#76b900,#3a5c00);margin:0 auto 10px;line-height:44px;font-size:18px;font-weight:800;color:#000;text-align:center;">E</div>
                    <div style="font-size:12px;font-weight:700;color:#76b900;margin-bottom:3px;">Evaluator</div>
                    <div style="font-size:11px;color:#525252;line-height:1.4;">Scores every answer</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#1f2e00,transparent);"></td></tr>
            </table>

            <!-- What happens section -->
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 40px;">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#4d7a00;margin-bottom:20px;">How it works</div>

                  <!-- Step 1 -->
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;width:100%;">
                    <tr>
                      <td width="32" style="vertical-align:top;padding-top:1px;">
                        <div style="width:24px;height:24px;border-radius:50%;background:#76b900;color:#000;font-size:12px;font-weight:800;line-height:24px;text-align:center;">1</div>
                      </td>
                      <td style="padding-left:12px;vertical-align:top;">
                        <div style="font-size:14px;font-weight:600;color:#e5e5e5;margin-bottom:2px;">Upload your resume + paste the JD</div>
                        <div style="font-size:13px;color:#525252;">The panel reads it before asking a single question</div>
                      </td>
                    </tr>
                  </table>

                  <!-- Step 2 -->
                  <table cellpadding="0" cellspacing="0" style="margin-bottom:16px;width:100%;">
                    <tr>
                      <td width="32" style="vertical-align:top;padding-top:1px;">
                        <div style="width:24px;height:24px;border-radius:50%;background:#76b900;color:#000;font-size:12px;font-weight:800;line-height:24px;text-align:center;">2</div>
                      </td>
                      <td style="padding-left:12px;vertical-align:top;">
                        <div style="font-size:14px;font-weight:600;color:#e5e5e5;margin-bottom:2px;">Get grilled by 3 AI interviewers</div>
                        <div style="font-size:13px;color:#525252;">Follow-ups, challenges, and clarifications — just like the real thing</div>
                      </td>
                    </tr>
                  </table>

                  <!-- Step 3 -->
                  <table cellpadding="0" cellspacing="0" style="width:100%;">
                    <tr>
                      <td width="32" style="vertical-align:top;padding-top:1px;">
                        <div style="width:24px;height:24px;border-radius:50%;background:#76b900;color:#000;font-size:12px;font-weight:800;line-height:24px;text-align:center;">3</div>
                      </td>
                      <td style="padding-left:12px;vertical-align:top;">
                        <div style="font-size:14px;font-weight:600;color:#e5e5e5;margin-bottom:2px;">Get your full debrief</div>
                        <div style="font-size:13px;color:#525252;">Score, strengths, weaknesses, study plan + drill questions</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:1px;background:linear-gradient(90deg,transparent,#1f2e00,transparent);"></td></tr>
            </table>

            <!-- Score preview -->
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 40px;">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#4d7a00;margin-bottom:16px;">Sample debrief</div>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.4);border:1px solid #1a1a1a;border-radius:12px;padding:20px;">
                    <tr>
                      <td>
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                          <tr>
                            <td>
                              <span style="font-size:13px;color:#737373;">Overall Score</span>
                            </td>
                            <td align="right">
                              <span style="font-size:22px;font-weight:800;color:#76b900;">8.4</span>
                              <span style="font-size:13px;color:#4d7a00;">/10</span>
                            </td>
                          </tr>
                        </table>
                        <!-- Score bar -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                          <tr>
                            <td style="background:#1a1a1a;border-radius:4px;height:6px;overflow:hidden;">
                              <div style="width:84%;height:6px;background:linear-gradient(90deg,#76b900,#4d7a00);border-radius:4px;"></div>
                            </td>
                          </tr>
                        </table>
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td width="50%" style="padding-right:8px;">
                              <div style="font-size:12px;color:#4ade80;margin-bottom:4px;">+ Strong system design</div>
                              <div style="font-size:12px;color:#4ade80;">+ Clear communication</div>
                            </td>
                            <td width="50%" style="padding-left:8px;">
                              <div style="font-size:12px;color:#f87171;margin-bottom:4px;">− Missed edge cases</div>
                              <div style="font-size:12px;color:#f87171;">− Depth on scalability</div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 40px 40px;">
              <tr>
                <td align="center">
                  <a href="https://mocki.dev"
                    style="display:inline-block;background:linear-gradient(135deg,#76b900,#4d7a00);color:#000;font-weight:800;font-size:16px;padding:16px 48px;border-radius:12px;text-decoration:none;letter-spacing:-0.3px;">
                    Start your first interview →
                  </a>
                  <div style="margin-top:12px;font-size:12px;color:#404040;">Free · No credit card · Takes 15 min</div>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── NVIDIA BADGE ───────────────────────────────────── -->
        <tr>
          <td style="padding:20px 0 8px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <div style="display:inline-block;background:#0f0f0f;border:1px solid #1a1a1a;border-radius:999px;padding:8px 18px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#76b900;display:inline-block;vertical-align:middle;margin-right:8px;"></span>
                    <span style="font-size:12px;color:#525252;vertical-align:middle;">Powered by NVIDIA Nemotron · Built at BeaverHacks 2026</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── FOOTER ─────────────────────────────────────────── -->
        <tr>
          <td style="padding-top:16px;text-align:center;font-size:12px;color:#333;line-height:1.8;">
            Built by Abhishek, Murali, Mithun &amp; Ross<br/>
            <a href="https://mocki.dev/about" style="color:#404040;text-decoration:none;">About</a>
            &nbsp;·&nbsp;
            <a href="https://mocki.dev/about" style="color:#404040;text-decoration:none;">Feedback</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${firstName}, your AI panel is ready 🎤`,
    html,
  });

  if (error) {
    console.error("[email] Failed to send welcome email:", error);
  } else {
    console.log(`[email] Welcome email sent to ${email}`);
  }
}

export async function sendCheckInEmail(email: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const resend = getResendClient();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };

  const firstName = name?.split(" ")[0] || "there";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Still thinking about that interview?</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e5e5e5;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:48px 20px 32px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <tr>
          <td style="border-radius:20px;overflow:hidden;background:linear-gradient(160deg,#0f1a00 0%,#0a0a0a 60%,#0d1f00 100%);border:1px solid #1f2e00;padding:0;">

            <!-- Green bar -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="height:3px;background:linear-gradient(90deg,#76b900,#4d7a00,#76b900);"></td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 40px 40px;">
              <tr><td>

                <!-- Logo -->
                <div style="margin-bottom:24px;">
                  <span style="font-size:26px;font-weight:900;letter-spacing:-1px;color:#76b900;">mocki</span>
                </div>

                <!-- Copy -->
                <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.3;">
                  Still thinking about that interview, ${firstName}?
                </h1>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#737373;">
                  You signed up for Mocki but haven't run a session yet.
                </p>
                <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:#737373;">
                  It takes about 15 minutes. Paste in a job description, upload your resume,
                  and three AI interviewers will drill you on exactly what the role needs —
                  then give you a full score breakdown and study plan.
                </p>

                <!-- CTA -->
                <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr>
                    <td>
                      <a href="https://mocki.dev"
                        style="display:inline-block;background:linear-gradient(135deg,#76b900,#4d7a00);color:#000;font-weight:800;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">
                        Start your first interview →
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Social proof line -->
                <p style="margin:0;font-size:12px;color:#404040;line-height:1.6;">
                  Free to use · No credit card · Your answers stay private
                </p>

              </td></tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding-top:20px;text-align:center;font-size:12px;color:#333;line-height:1.8;">
            Mocki · <a href="https://mocki.dev" style="color:#404040;text-decoration:none;">mocki.dev</a>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Still thinking about that interview, ${firstName}?`,
    html,
  });

  if (error) {
    console.error("[email] check-in failed:", email, error);
    return { ok: false, error: String(error) };
  }
  console.log(`[email] check-in sent to ${email}`);
  return { ok: true };
}
