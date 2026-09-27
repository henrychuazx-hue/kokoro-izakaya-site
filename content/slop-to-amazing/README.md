# Slop → Decent → Amazing reel

Format clone of a "fix bad posters" reel: the same poster shown at three quality tiers, two rounds, then a comment-for-prompt CTA. All posters are original, made in Higgsfield (GPT Image 2.5, high, 2K, 3:4) for our own brands.

**Output:** `out/slop_to_amazing.mp4`, 1080x1920, 30fps, 16.5s, with pop SFX (add trending audio in-app).

## Edit timeline

| Time (s) | Beat |
|---|---|
| 0.10 | Round 1 (Kokoro Izakaya): SLOP pops in |
| 1.10 | DECENT pops in |
| 2.20 | AMAZING pops in |
| 3.70 | Hard cut to round 2 (Founders' Notes): SLOP |
| 5.00 | DECENT |
| 6.20 | AMAZING |
| 8.90 | Focus beat: everything blurs except the SLOP poster, a red frame draws round it (the input the prompt fixes) |
| 12.50–16.50 | CTA card: Comment "POSTER" and I'll send you the prompt in your DMs |

## Rebuild or tweak

```bash
pip install Pillow numpy imageio-ffmpeg
python3 build_reel.py --wordmark "zero context" --keyword POSTER
```

Swap any poster by replacing the file in `posters/` (same name) and re-running the script. Timings are constants at the top of `build_reel.py`.

**ChatCut handoff:** to finish the edit in ChatCut instead, drop the six files from `posters/` onto a 9:16 timeline in the order above, add the three labels (Inter Black, red `#C8102E`, amber `#DEA400`, green `#22B124`), and use the timeline table for the cuts.

## Higgsfield prompts

Project: *Slop to Amazing reel clone*. The Amazing tier follows the rules in the Design Prompt doc: one hero, one promise, one visual path, and type that interacts with the subject.

| File | Prompt focus |
|---|---|
| `r1_slop` | Kokoro Izakaya, free-template-app clutter: chrome 3D type, starbursts, flares, six food photos, clip art |
| `r1_decent` | Kokoro Izakaya, clean template: overhead yakitori photo over a black panel, centred type, red button |
| `r1_amazing` | Kokoro Izakaya: macro skewer on binchotan, 100mm f2.8, low-key side light, giant 炭 behind the skewer, brand palette (ink, ember, gold, paper) |
| `r2_slop` | Founders' Notes, neon gradient, chrome type, clip art money bags and rockets, badly cut-out stock businessman |
| `r2_decent` | Founders' Notes, B&W mic photo on the left, condensed type on the right, black button |
| `r2_amazing` | Founders' Notes: one broadcast mic in a hard spotlight, 50mm f1.8, headline overlapped by the mic, single amber underline |

The full prompt text is in the Higgsfield project history.
