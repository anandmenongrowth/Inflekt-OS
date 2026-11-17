"""Send the morning brief by SMTP. Stdlib only. Env: SMTP_USER, SMTP_PASS, optional SMTP_HOST/SMTP_PORT, RUNNER_TEMP."""
import json, os, smtplib
from email.message import EmailMessage

m = json.load(open(os.path.join(os.environ.get("RUNNER_TEMP", "."), "mail.json"), encoding="utf-8"))
user, pw = os.environ["SMTP_USER"], os.environ["SMTP_PASS"]

msg = EmailMessage()
msg["From"] = user
msg["To"] = m["to"]
msg["Subject"] = m["subject"]
msg.set_content(m["body"])

with smtplib.SMTP_SSL(os.environ.get("SMTP_HOST", "smtp.gmail.com"), int(os.environ.get("SMTP_PORT", "465"))) as s:
    s.login(user, pw)
    s.send_message(msg)
print("Sent to", m["to"])
