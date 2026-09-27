"""Slop / Decent / Amazing reel builder.

Stitches six Higgsfield posters into a 1080x1920 vertical reel with pop-in
animation, a blur-focus beat on the slop poster and a comment-for-prompt CTA.

Usage:
    python3 build_reel.py [--wordmark "zero context"] [--keyword POSTER]

Needs: Pillow, numpy, imageio-ffmpeg (pip install Pillow numpy imageio-ffmpeg)
Inputs: posters/r1_slop.png ... posters/r2_amazing.png, fonts/Inter-*.ttf
Output: out/slop_to_amazing.mp4
"""
import argparse
import math
import os
import subprocess
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1080, 1920, 30
DURATION = 16.5

POSTER_W, POSTER_H = 345, 460
POSTER_X = 171
ROW_TOPS = [150, 624, 1098]
LABEL_X = 546
LABELS = [("SLOP", (200, 16, 46)), ("DECENT", (222, 164, 0)), ("AMAZING", (34, 177, 36))]

# (round, tier, appear_time_s)
BEATS = [
    (0, 0, 0.10), (0, 1, 1.10), (0, 2, 2.20),
    (1, 0, 3.70), (1, 1, 5.00), (1, 2, 6.20),
]
ROUND_START = [0.0, 3.70]
FOCUS_START, FOCUS_RAMP = 8.90, 0.40
CTA_START = 12.50
POP_DUR = 0.22

ROUNDS = [
    ["r1_slop.jpg", "r1_decent.jpg", "r1_amazing.jpg"],
    ["r2_slop.jpg", "r2_decent.jpg", "r2_amazing.jpg"],
]


def font(weight, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", f"Inter-{weight}.ttf"), size)


def ease_out_back(t):
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def ease_out_cubic(t):
    return 1 - (1 - t) ** 3


def make_background():
    # Warm studio grey with a soft vignette, matching the reference's paper-wall feel.
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W * 0.62)) ** 2 + ((y - H * 0.45) / (H * 0.62)) ** 2)
    v = np.clip(d, 0, 1.4) ** 2.2
    base = np.array([242, 239, 234], np.float32)
    edge = np.array([176, 172, 166], np.float32)
    img = base[None, None, :] * (1 - v[..., None] * 0.55) + edge[None, None, :] * (v[..., None] * 0.55)
    noise = np.random.default_rng(7).normal(0, 2.2, (H, W, 1))
    return Image.fromarray(np.clip(img + noise, 0, 255).astype(np.uint8), "RGB")


def load_poster(name):
    im = Image.open(os.path.join(HERE, "posters", name)).convert("RGB")
    # Cover-crop to the poster slot.
    r = max(POSTER_W / im.width, POSTER_H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    left, top = (im.width - POSTER_W) // 2, (im.height - POSTER_H) // 2
    return im.crop((left, top, left + POSTER_W, top + POSTER_H))


def poster_with_shadow(im):
    pad = 40
    canvas = Image.new("RGBA", (POSTER_W + pad * 2, POSTER_H + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([pad, pad + 10, pad + POSTER_W, pad + POSTER_H + 10], fill=(0, 0, 0, 90))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    canvas.paste(im, (pad, pad))
    return canvas, pad


def label_image(text, colour):
    f = font(900, 74)
    box = f.getbbox(text)
    im = Image.new("RGBA", (box[2] + 10, box[3] + 10), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((0, 0), text, font=f, fill=colour + (255,))
    return im


def paste_scaled(dst, src, cx, cy, scale, alpha):
    if scale <= 0.01 or alpha <= 0.01:
        return
    w, h = max(1, round(src.width * scale)), max(1, round(src.height * scale))
    s = src.resize((w, h), Image.BICUBIC)
    if alpha < 1:
        a = s.getchannel("A").point(lambda p: round(p * alpha))
        s.putalpha(a)
    dst.alpha_composite(s, (round(cx - w / 2), round(cy - h / 2)))


def pop(t, start):
    """Scale and alpha for a pop-in that begins at `start`."""
    if t < start:
        return 0.0, 0.0
    p = min(1.0, (t - start) / POP_DUR)
    return 0.82 + 0.18 * ease_out_back(p), min(1.0, p * 2.2)


def render_frame(t, bg, posters, labels, wordmark_im, cta_im):
    frame = bg.convert("RGBA")
    if t >= CTA_START:
        p = min(1.0, (t - CTA_START) / 0.35)
        paste_scaled(frame, cta_im, W / 2, H * 0.505 + (1 - ease_out_cubic(p)) * 30, 1.0, p)
        frame.alpha_composite(wordmark_im, ((W - wordmark_im.width) // 2, 1560))
        return frame.convert("RGB")

    rnd = 1 if t >= ROUND_START[1] else 0
    focus = 0.0
    if rnd == 1 and t >= FOCUS_START:
        focus = ease_out_cubic(min(1.0, (t - FOCUS_START) / FOCUS_RAMP))

    sharp = Image.new("RGBA", (W, H), (0, 0, 0, 0))   # stays crisp during the focus beat
    soft = Image.new("RGBA", (W, H), (0, 0, 0, 0))    # blurs during the focus beat
    for r, tier, start in BEATS:
        if r != rnd:
            continue
        s, a = pop(t, start)
        pim, pad = posters[r][tier]
        cy = ROW_TOPS[tier] + POSTER_H / 2
        target = sharp if tier == 0 else soft
        paste_scaled(target, pim, POSTER_X + POSTER_W / 2, cy, s, a)
        ls, la = pop(t, start + 0.06)
        lab = labels[tier]
        paste_scaled(soft, lab, LABEL_X + lab.width / 2, cy, ls, la)
    soft.alpha_composite(wordmark_im, ((W - wordmark_im.width) // 2, 1590))

    if focus > 0:
        soft = soft.filter(ImageFilter.GaussianBlur(16 * focus))
        # Red selection frame draws around the slop poster: this is the input the prompt fixes.
        d = ImageDraw.Draw(sharp)
        x0, y0 = POSTER_X - 6, ROW_TOPS[0] - 6
        x1, y1 = POSTER_X + POSTER_W + 6, ROW_TOPS[0] + POSTER_H + 6
        per = 2 * ((x1 - x0) + (y1 - y0))
        drawn = per * focus
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            seg = math.hypot(bx - ax, by - ay)
            if drawn <= 0:
                break
            k = min(1.0, drawn / seg)
            d.line([(ax, ay), (ax + (bx - ax) * k, ay + (by - ay) * k)], fill=(214, 20, 40, 255), width=9)
            drawn -= seg
    frame.alpha_composite(soft)
    frame.alpha_composite(sharp)
    return frame.convert("RGB")


def make_sfx(path):
    """Soft pop on each poster reveal. Music gets added in-app for reach."""
    sr = 44100
    audio = np.zeros(int(DURATION * sr), np.float32)
    t = np.arange(int(0.12 * sr)) / sr
    pop_snd = np.sin(2 * np.pi * (520 + 900 * np.exp(-t * 60)) * t) * np.exp(-t * 38) * 0.35
    whoosh_t = np.arange(int(0.35 * sr)) / sr
    whoosh = np.random.default_rng(3).normal(0, 1, whoosh_t.size) * np.sin(np.pi * whoosh_t / 0.35) ** 2 * 0.06
    for _, _, start in BEATS:
        i = int(start * sr)
        audio[i:i + pop_snd.size] += pop_snd
    for start in (FOCUS_START, CTA_START):
        i = int(start * sr)
        audio[i:i + whoosh.size] += whoosh
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wordmark", default="zero context")
    ap.add_argument("--keyword", default="POSTER")
    ap.add_argument("--out", default=os.path.join(HERE, "out", "slop_to_amazing.mp4"))
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)

    bg = make_background()
    posters = [[poster_with_shadow(load_poster(n)) for n in rnd] for rnd in ROUNDS]
    labels = [label_image(txt, col) for txt, col in LABELS]

    wf = font(800, 40)
    wb = wf.getbbox(args.wordmark)
    wordmark_im = Image.new("RGBA", (wb[2] + 4, wb[3] + 8), (0, 0, 0, 0))
    ImageDraw.Draw(wordmark_im).text((0, 0), args.wordmark, font=wf, fill=(20, 20, 20, 255))

    l1 = f"Comment “{args.keyword}” and I’ll"
    l2 = "send you the prompt in your DMs"
    f1, f2 = font(800, 62), font(500, 40)
    cw = max(f1.getbbox(l1)[2], f2.getbbox(l2)[2]) + 10
    cta_im = Image.new("RGBA", (cw, 150), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cta_im)
    cd.text(((cw - f1.getbbox(l1)[2]) / 2, 0), l1, font=f1, fill=(15, 15, 15, 255))
    cd.text(((cw - f2.getbbox(l2)[2]) / 2, 86), l2, font=f2, fill=(40, 40, 40, 255))

    sfx = os.path.join(os.path.dirname(args.out), "sfx.wav")
    make_sfx(sfx)

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", sfx, "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(DURATION * FPS)):
        proc.stdin.write(render_frame(i / FPS, bg, posters, labels, wordmark_im, cta_im).tobytes())
    proc.stdin.close()
    proc.wait()
    print("wrote", args.out)


if __name__ == "__main__":
    main()
