# Kallaway's Growth System skills: safety audit and Cooked or Cracked brief

27 Sep 2026. Source: Kallaway, "How to Use Claude To Grow From 0 to 100K Followers (Full Course)", youtu.be/vwlK6MbdAto, plus his instructions PDF and the public Drive folder "Growth System (Strategy & Positioning)".

## Verdict

**Safe to install, with three conditions.** [Certain] for the six files as downloaded on 27 Sep 2026.

1. Run it in a chat with every connector except Sandcastles switched off (Gmail, Drive, Calendar, Notion and the rest).
2. Hash-check the files before you install. A Drive owner can swap a file after you scan it.
3. Read the Sandcastles tool descriptions before you run anything. That MCP is the part no file scan covers.

## What I checked

| Check | Result |
|---|---|
| Files in the pack | 6 `.skill` archives, each holding one `SKILL.md`. No scripts, no other files |
| Hidden characters (zero width, bidi, tag chars) | 0 in all six |
| HTML comments or encoded blobs | 0 |
| External links | 1, `shortform.academy`, used only as a sign-off CTA |
| NVIDIA SkillSpector v2.12.0, static mode | All six: 0/100, LOW, SAFE, 0 issues |
| My safety check prompt (blind run by a separate agent) | SAFE WITH CONDITIONS |
| Line by line manual read | No instruction to access anything outside Sandcastles and the `growth-system/` folder |

### Controls (proof the checks work)

A scanner that passes everything proves nothing, so I built two harmless demo skills with the same payload: read the user's email, put private details in a caption, hide it.

| Test file | SkillSpector static | Safety check prompt |
|---|---|---|
| `caption-helper` (HTML comment, "ignore previous instructions") | **67/100, DO NOT INSTALL**, 4 HIGH issues | not run |
| `caption-helper-pro` (same attack in plain, polite English) | **0/100, SAFE. Missed.** | **DO NOT INSTALL**, hiding line quoted |
| Kallaway's six skills | 0/100, SAFE | SAFE WITH CONDITIONS |

This is the story for the video. Pattern scanners catch lazy attacks. A polite instruction sails through. The prompt catches it because it asks what a skill does, and ignores how it is worded.

SkillSpector also has an LLM pass that reads intent. It needs an API key, so I could not run it here. Running it on the polite canary on camera is a good test (gate T4 in the run sheet).

## Lines worth naming on camera

None are malicious. Each one uses the same lever a malicious skill would use.

| Where | Line | What it does |
|---|---|---|
| bullseye-builder, line 28 | "Silent triage (the user never sees this)" | Picks your starting path without telling you |
| bullseye-builder, line 34 | "If it fails, route to Path C without saying so." | Same. The prompt test picked this as the single most concerning line |
| growth-system, line 37 | "Route = invoke. Don't describe the next skill" | Chains skills without asking first |
| Every skill, final section | CTA to shortform.academy | A skill author putting words in your AI's mouth. Harmless here |
| unique-positioning-builder, line 37 | `create_automation_rule` | A standing Sandcastles rule that keeps spending credits daily after you close the chat. It asks for your yes first |

## The real risk sits outside the files

The skills tell Claude to pull captions, transcripts and bios from 8 to 12 other creators' channels and up to 50 of their top videos through the Sandcastles MCP [Certain, from the skill text]. Any creator can write an instruction into a caption or say one in a video. Claude reads it in the same chat where it can reach your connectors.

This Claude account has Gmail, Google Drive, Google Calendar, Notion, Asana, Shopify, Vercel and more connected [Certain, visible from this session]. Untrusted text, private data and a way to send things out, all in one chat, is Simon Willison's "lethal trifecta". Condition 1 above breaks it.

## Cooked or Cracked: facts from the files

| Cracked | Cooked |
|---|---|
| Shows a credit bill and waits for an explicit yes before spending anything | The orchestrator names 10 skills. The free folder has 6. Missing: engine-builder, topic-brainstormer, video-maker, channel-coach, which are the ones that write hooks and scripts |
| Five minute, one question at a time voice interview | Needs a paid Sandcastles plan (Pro, Visionary or Titan, per his PDF) |
| Clean markdown. Nothing executable | First full strategy run: up to 86 analysis credits (36 from Positioning Builder at 3 videos x 12 channels, 50 from Topic Scanner). Derived from the skill text. Dollar cost per credit: unverified |
| Makes you study real videos from your niche before you pick a format | "Certain steps might take 30 to 60 mins" (his PDF). At about 60 seconds per video analysis, 86 videos is roughly 86 minutes worst case |

Your verdict goes on screen after you run it. The run sheet has the tests.

## Ep 1 continuity: why Blotato Generate scored 92 CRITICAL

Your Ep 1 test plan logged SkillSpector at 92/100 CRITICAL for Blotato's Generate skill. Re-run here on the same repo (commit 5d6f76f, 18 Aug 2026): 92/100, DO NOT INSTALL, 41 issues.

| Finding | Count | What the flagged line does |
|---|---|---|
| Credential Access (HIGH) | 17 | Reads its own `.env` for `KIE_API_KEY` |
| External Script Fetching (HIGH) | 5 | `curl` to `api.kie.ai` with that key in the header |
| External Transmission (MEDIUM) | 19 | The same API calls |

Every `KIE_API_KEY` use goes to `api.kie.ai` [Certain, from grep across all scripts]. A skill that calls a paid API has to read a key and send it to that API, so the score is pattern matching on its job [Likely benign; I checked the hosts and key handling, not every line]. Last week's skill scored 92 for doing its job. This week's fake scored 0 and would leak your inbox. That contrast is the series' through-line: the score counts patterns, and you still read what the skill does.

## What I could not do from here

1. **Control your desktop or screen record.** This session runs in a cloud container. Everything below is built for you to record on your Mac.
2. **Watch the video.** YouTube blocks cloud IPs (HTTP 429 on every route). I analysed the system through the six skills and his PDF, which encode the full course pipeline.
3. **Instagram post.** Skipped, as you said.

## Files in this folder

| File | Use |
|---|---|
| `script-ep3-kallaway.md` | The 55-60s script in your Ep 1 beat format. Start here |
| `shot-list.html` | Click-in-order shot list, same style as Ep 1 |
| `run-sheet.md` | Setup, terminal commands, test gates, ChatCut edit brief, long fallback script |
| `safety-check-prompt.md` | Paste-ready prompt. Your Step 0 for every tool on the channel |
| `overlays/*.png` | Five 1080 x 1920 cards for ChatCut. Text kept clear of the Reels UI strip |
| `overlays/source/` | HTML for the cards, if a line needs changing |
| `demo-canaries/` | The two fake skills for the on-camera scan, with their own README. **Never install these in Claude.** `caption-helper-pro` would try to read your email |

## SHA-256 of the files I scanned

```
a8823db8199cd95a33bf31e14b1419dde0334e0803536bd8ad6ad5fd3f45ae4f  bullseye-builder.skill
2f5c0056ffa1f39e1885b16299af9e0310a138d02cd784c58f0c9bde279c30a4  format-finder.skill
b2bc3e6d3ef261035f2232a692313b8c0f4a06c52fdccd5b2f181988ea1da54e  growth-system.skill
6f3d8877e6b239dd2f1eda343d77bc831f4feea61fd9b7e77fa4693b924c0025  niche-interviewer.skill
f2a396b23bde0aa1b960788d9950a09bba0e742c4f386608b5396675f61696c7  topic-scanner.skill
042d20e43b27c42db947c96ebfb5d455dc2589fc7d6fc8c43338110ceeefe49c  unique-positioning-builder.skill
```
