"""Generates test/fixtures/thread.html: a synthetic Google Voice conversation that
copies the live DOM structure (verified 2026-08-26) with made-up names and text."""
import html
import os

GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"


def emoji_img(e):
    return f'<img alt="{e}" aria-label="emoji" class="emoji medium" src="{GIF}">'


def row(direction, sender, inner_html, plain_text, cluster="start-of-cluster end-of-cluster", when="Sat 10:01 AM"):
    status = ""
    if "end-of-cluster" in cluster:
        status = (f'<div class="status"><div class="sender-timestamp"><span class="sender">{html.escape(sender)}</span>'
                  f'<span class="bullet">•</span><span class="timestamp">{when}</span></div></div>')
    hidden = f'Message from {html.escape(sender)}, {html.escape(plain_text)}, Saturday, August 22 2026, 10:01 AM.'
    return f'''<li>
  <gv-message-item>
    <div class="full-container {direction} {cluster}">
      <div class="container">
        {status}
        <div class="cdk-visually-hidden">{hidden}</div>
        <div class="message-row">
          <gv-avatar class="avatar"><span class="avatar-dot"></span></gv-avatar>
          <div class="subject-content-container bubble"><div><gv-annotation class="content">{inner_html}</gv-annotation></div></div>
          <div class="options-button-container"></div>
        </div>
      </div>
    </div>
  </gv-message-item>
</li>'''


A = "Alex Example"
rows = [
    row("incoming", A, "Hey, are we still on for Saturday?", "Hey, are we still on for Saturday?"),
    row("outgoing", "you", "Yes! 10am at the park " + emoji_img("🙏"), "Yes! 10am at the park 🙏"),
    row("incoming", A, "Loved “Yes! 10am at the park " + emoji_img("🙏") + "”", "Loved “Yes! 10am at the park 🙏”"),
    row("outgoing", "you", "Bring the frisbee", "Bring the frisbee"),
    row("incoming", A, "Reacted " + emoji_img("😂") + " to “Bring the frisbee”", "Reacted 😂 to “Bring the frisbee”"),
    row("incoming", A, "See you there", "See you there", cluster="start-of-cluster"),
    row("incoming", A, "Removed a heart from “Yes! 10am at the park " + emoji_img("🙏") + "”",
        "Removed a heart from “Yes! 10am at the park 🙏”", cluster="end-of-cluster"),
    row("incoming", A, "Loved an image", "Loved an image"),
    row("incoming", A, "Liked “this original is not loaded”", "Liked “this original is not loaded”"),
]

page = f'''<!doctype html>
<meta charset="utf-8">
<title>gv-tapback fixture</title>
<style>
  body {{ font: 14px/1.4 Roboto, Arial, sans-serif; margin: 0; background: #fff; }}
  .messages-container {{ width: 520px; margin: 12px auto; }}
  ul.list {{ list-style: none; margin: 0; padding: 0; }}
  li {{ margin: 6px 0; }}
  .status {{ font-size: 12px; color: #5f6368; margin: 2px 0 2px 44px; }}
  .full-container.outgoing .status {{ text-align: right; margin-right: 8px; }}
  .bullet {{ margin: 0 4px; }}
  .cdk-visually-hidden {{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }}
  .message-row {{ display: flex; align-items: flex-end; }}
  .full-container.outgoing .message-row {{ flex-direction: row-reverse; }}
  gv-avatar {{ width: 32px; height: 32px; margin: 0 6px; }}
  .avatar-dot {{ display: block; width: 32px; height: 32px; border-radius: 50%; background: #e91e63; }}
  .full-container.outgoing gv-avatar {{ visibility: hidden; }}
  .subject-content-container.bubble {{ position: relative; display: block; max-width: 340px; padding: 10px 16px; border-radius: 20px; background: #f0f4f9; }}
  .full-container.outgoing .bubble {{ background: #d3e3fd; }}
  img.emoji {{ width: 18px; height: 18px; vertical-align: -3px; }}
</style>
<gv-app><gv-threads-view><gv-thread-details><gv-message-list>
<section class="container"><div class="messages-container"><h3 class="cdk-visually-hidden">Messages</h3>
<ul class="list">
{chr(10).join(rows)}
</ul></div></section>
</gv-message-list></gv-thread-details></gv-threads-view></gv-app>
'''

out = os.path.join(os.path.dirname(__file__), "fixtures", "thread.html")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    f.write(page)
print("wrote", out, len(page), "bytes")
