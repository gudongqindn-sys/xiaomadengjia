"""把关卡里所有角色台词预先生成成配音文件。

    python3 -m venv .venv && .venv/bin/pip install edge-tts
    .venv/bin/python scripts/gen_voices.py            # 只生成缺的
    .venv/bin/python scripts/gen_voices.py --force    # 全部重来（换了声音时用）

用的是微软 Edge「大声朗读」的神经网络语音（edge-tts，非官方接口，免费、不用账号）。
原型阶段用；正式上线前换成腾讯云等正规语音合成服务，文件格式和 manifest 不用变。

谁说哪句、模板怎么展开，要和 prototype/app.js 里的 say() 调用保持一致；
对不上的台词在页面上会退回浏览器自带的合成声音，build 时会列出来。
"""
import asyncio
import hashlib
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
LEVEL = json.loads((ROOT / "content/level-01.json").read_text("utf-8"))
OUT_DIR = ROOT / "audio" / LEVEL["id"]
MANIFEST = ROOT / "audio" / "manifest.json"

# 每个角色一个固定声音。青少年队友用成年男声调高音高。
VOICES = {
    "coach": {"voice": "en-US-GuyNeural", "rate": "+0%", "pitch": "+0Hz"},
    "alex": {"voice": "en-US-ChristopherNeural", "rate": "+6%", "pitch": "+12Hz"},
    "ben": {"voice": "en-US-EricNeural", "rate": "+8%", "pitch": "+18Hz"},
    "mia": {"voice": "en-US-AnaNeural", "rate": "+0%", "pitch": "+0Hz"},
}
ASR_LINE = "Sorry, I didn't catch that. Can you say it again?"


def cap(s):
    return s[:1].upper() + s[1:] if s else s


def expand(tpl, step):
    """模板台词按所有可能的取值展开，和 app.js 的 fill() 一致（替换后首字母大写）。"""
    skills = sorted({v for s in LEVEL["steps"] for i in s.get("intents", []) if i.get("slot") for v in i["slot"]["map"].values()})
    options = ["yourself" if o["id"] == "me" else LEVEL["characters"][o["id"]]["name"] for o in step.get("options", [])]
    outs = [tpl]
    if "{skill}" in tpl:
        outs = [t.replace("{skill}", v) for t in outs for v in skills]
    if "{optionName}" in tpl:
        outs = [t.replace("{optionName}", v) for t in outs for v in options]
    return [cap(t) for t in outs]


def collect():
    lines = []

    def add(who, text, step):
        for t in expand(text, step):
            lines.append((who, t))

    for st in LEVEL["steps"]:
        t = st["type"]
        if t == "listen":
            for m in st["messages"]:
                add(m["from"], m["text"], st)
            continue
        if t not in ("speak", "court"):
            continue
        host = st["speaker"] if t == "speak" else "coach"
        if t == "court":
            add("coach", st["coachLine"], st)
        else:
            add(host, st["line"], st)
        add(host, ASR_LINE, st)
        add(host, st["offTask"], st)
        for r in st.get("redirects", []):
            add(host, r["reply"], st)
        for a in st.get("ambiguous", []):
            add(host, a["clarify"], st)
        for i in st["intents"]:
            who = i.get("speaker") or host
            add(who, i["reply"], st)
            if i.get("replyKeyword"):
                add(who, i["replyKeyword"], st)
        f = st.get("followUp")
        if f:
            add(host, f["line"], st)
            add(host, f["offTask"], st)
            for i in f["intents"]:
                add(i.get("speaker") or host, i["reply"], st)
                if i.get("replyKeyword"):
                    add(i.get("speaker") or host, i["replyKeyword"], st)
    seen, uniq = set(), []
    for who, text in lines:
        if (who, text) not in seen:
            seen.add((who, text))
            uniq.append((who, text))
    return uniq


def key(who, text):
    return f"{who}|{text}"


async def synth(who, text, path):
    v = VOICES[who]
    for attempt in range(3):
        try:
            await asyncio.wait_for(
                edge_tts.Communicate(text, v["voice"], rate=v["rate"], pitch=v["pitch"]).save(str(path)), 40
            )
            if path.stat().st_size > 0:
                return
        except Exception as e:  # 网络抖动，重试
            print(f"  重试 {attempt + 1}: {who} {text[:30]} ({e})")
    raise RuntimeError(f"生成失败：{who} {text}")


async def main(force):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    todo = collect()
    for who, text in todo:
        v = VOICES[who]
        h = hashlib.sha1(f"{v['voice']}|{v['rate']}|{v['pitch']}|{text}".encode()).hexdigest()[:12]
        path = OUT_DIR / f"{who}-{h}.mp3"
        if force or not path.exists() or path.stat().st_size == 0:
            print(f"生成 {who}: {text}")
            await synth(who, text, path)
        manifest[key(who, text)] = path.relative_to(ROOT).as_posix()
    # 清掉不再用到的旧文件
    used = set(manifest.values())
    for p in OUT_DIR.glob("*.mp3"):
        if p.relative_to(ROOT).as_posix() not in used:
            p.unlink()
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"共 {len(manifest)} 句，写入 {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    asyncio.run(main("--force" in sys.argv))
