#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""线上校验工具：确认线上仓库文件树、关键 URL、Pages 构建状态均正常。

用法：
  python3 tools/verify.py

检查项：
  1) 线上 main 的 HEAD / commit message / 文件数
  2) 关键文件（源码/素材/交付物/文档/工具）size 与本地一致、内容为明文
  3) 线上关键 URL 全部 HTTP 200
  4) tag 与 Release 存在
  5) Pages 构建状态 built
"""
import os, io, sys, time
import urllib.request, urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from release import (req, remote_tree, local_files, REPO_DIR, OWNER, REPO, API, assert_plaintext)

SITE = "https://yidiandiandfengxue.github.io"
KEY_FILES = [
    "index.html", "case-dmtt.html", "case-teamhub.html",
    "case-libao.html", "orchestra-demo/index.html", "assets/libao/libao.glb",
    "CHANGELOG.md", "README.md",
    "tools/release.py", "tools/verify.py",
    "assets/dmtt/splash.png", "assets/dmtt/iwork-apps.png",
    "deliverables/Oscar-离线版.html", "deliverables/Oscar-作品集-含DMTT案例.zip",
    "deliverables/previews/项目6-12设计页面概览-斜向滚动墙-桌面.png",
]
KEY_URLS = [
    "", "index.html", "case-dmtt.html", "case-teamhub.html",
    "case-libao.html", "orchestra-demo/index.html", "assets/libao/libao.glb",
    "CHANGELOG.md", "README.md", "tools/release.py",
    "assets/dmtt/splash.png",
    "deliverables/Oscar-%E7%A6%BB%E7%BA%BF%E7%89%88.html",
    "deliverables/Oscar-%E4%BD%9C%E5%93%81%E9%9B%86-%E5%90%ABDMTT%E6%A1%88%E4%BE%8B.zip",
]


def http_status(url, timeout=90, retries=2):
    """HEAD 探测；大文件在本机代理下偶发超时，做有限重试。"""
    last = None
    for i in range(retries + 1):
        r = urllib.request.Request(url, method="HEAD")
        r.add_header("User-Agent", "workbuddy-verify")
        try:
            with urllib.request.urlopen(r, timeout=timeout) as f:
                return f.status
        except urllib.error.HTTPError as e:
            return e.code
        except Exception as e:
            last = e
            time.sleep(2)
    return "ERR:" + str(last)[:40]


def main():
    problems = []
    ref, _ = req("GET", "/git/ref/heads/main")
    head = ref["object"]["sha"]
    commit, _, remote = remote_tree(head)
    print("线上 HEAD:", head[:12], "|", commit.get("message", "").splitlines()[0])
    print("线上文件数:", len(remote))

    print("\n=== 1) 关键文件 size 与明文 ===")
    for p in KEY_FILES:
        e = remote.get(p)
        lp = os.path.join(REPO_DIR, p)
        if not e:
            print("  缺失(线上):", p); problems.append("线上缺 " + p); continue
        if not os.path.exists(lp):
            print("  缺失(本地):", p); problems.append("本地缺 " + p); continue
        rs, ls = e.get("size"), os.path.getsize(lp)
        ok = rs == ls
        if not ok:
            problems.append("size 不一致 " + p)
        print("  %s %-58s remote=%s local=%s" % ("OK " if ok else "BAD", p, rs, ls))
        if p.endswith((".html", ".md", ".py")):
            raw = io.open(lp, "rb").read()
            try:
                assert_plaintext(p, raw)
            except Exception as ex:
                problems.append("密文 " + p); print("   ", ex)

    print("\n=== 2) 关键 URL HTTP ===")
    for u in KEY_URLS:
        code = http_status(SITE + "/" + u)
        if code != 200:
            problems.append("URL %s -> %s" % (u, code))
        print("  %-5s %s" % (code, u or "(root)"))

    print("\n=== 3) tag / Release ===")
    # 以最新 Release 为准，不依赖 commit message 里是否写了版本号
    try:
        rel, _ = req("GET", "/releases/latest")
        ver = rel.get("tag_name", "")
    except Exception:
        ver = ""
    if ver:
        tg, _ = req("GET", "/git/ref/tags/" + ver)
        print("  tag", ver, "->", tg["object"]["sha"][:12])
        print("  Release", rel.get("name"), "->", rel.get("html_url", ""))
    else:
        problems.append("未找到任何 Release")
        print("  未找到任何 Release")

    print("\n=== 4) Pages 构建 ===")
    for i in range(10):
        p, _ = req("GET", "/pages", timeout=30)
        b = p.get("build") or {}
        print("  status=%s build=%s commit=%s" % (
            p.get("status"), b.get("status"), (b.get("commit") or "")[:12]))
        # status=built 是权威判断；build 字段在 fine-grained token 下可能为 null，仅作参考
        if p.get("status") == "built":
            break
        time.sleep(8)
    else:
        problems.append("Pages 未 built")

    print("\n" + "=" * 46)
    if problems:
        print("发现问题", len(problems), "项:")
        for x in problems:
            print("  !!", x)
        sys.exit(1)
    else:
        print("全部检查通过，线上正常。")


if __name__ == "__main__":
    main()
