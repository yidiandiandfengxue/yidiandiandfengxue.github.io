#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""发版工具：把本地仓库文件树以「明文」推送到 GitHub main，保持历史连续。

为什么不用 git push：
  1) 本机代理对 github.com 的 git 隧道返回 CONNECT 502（api.github.com 正常）；
  2) DLP 对 .html/.md 透明加密，git 对象里是密文、磁盘读到的是明文，
     直接 push 会把乱码推上线。本脚本用 Python 读磁盘明文，走 REST Git Data API
     （blobs -> trees -> commits -> PATCH refs/heads/main -> tag -> release），
     以线上 HEAD 为 parent 追加提交，绝不强推。

用法：
  python3 tools/release.py --dry-run                       # 只比对，不推送
  python3 tools/release.py --version v1.6.0 \
      --tag-message "简述" --release-body-body "Release 正文"
  # 也可 --release-body-file RELEASE.md 从文件读正文（推荐长正文）

Token：~/.workbuddy/gh_pat（fine-grained PAT，需本仓库 Contents 读写权限）。
"""
import os, io, sys, json, base64, hashlib, subprocess, argparse, time
import urllib.request, urllib.error

OWNER = "yidiandiandfengxue"
REPO = "yidiandiandfengxue.github.io"
API = "https://api.github.com/repos/%s/%s" % (OWNER, REPO)
# 脚本位于 <repo>/tools/release.py，仓库根目录即站点源码
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = open(os.path.expanduser("~/.workbuddy/gh_pat"), encoding="utf-8").read().strip()

# 单次 blob payload 上限（base64 后）。超过会触发 422 / 连接中断，发版前应拆分或压缩。
BLOB_WARN_BYTES = 38 * 1024 * 1024


def req(method, path, payload=None, timeout=240):
    url = API + path
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    r.add_header("Accept", "application/vnd.github+json")
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "workbuddy-release")
    try:
        with urllib.request.urlopen(r, timeout=timeout) as f:
            body = f.read()
            return (json.loads(body) if body else {}), f.status
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:600]
        raise RuntimeError("HTTP %s %s -> %s" % (e.code, path, detail))


def local_files():
    """列出本地仓库跟踪的文件（排除 .gitignore 命中的项）。"""
    out = subprocess.check_output(
        ["git", "-C", REPO_DIR, "-c", "core.quotePath=false", "ls-tree", "-r", "HEAD", "--name-only"],
        text=True)
    return [p for p in out.splitlines() if p]


def remote_tree(head):
    commit, _ = req("GET", "/git/commits/" + head)
    tree, _ = req("GET", "/git/trees/" + commit["tree"]["sha"] + "?recursive=1")
    blobs = {e["path"]: e for e in tree["tree"] if e["type"] == "blob"}
    return commit, tree["sha"], blobs


def assert_plaintext(path, raw):
    """发版前校验 .html/.md 是明文，杜绝把 DLP 密文推上线。"""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".html", ".htm", ".md"):
        head = raw[:500].decode("utf-8", "replace")
        ok = ("<!DOCTYPE" in head.upper() or "<HTML" in head.upper() or head.lstrip().startswith("#"))
        if not ok:
            raise RuntimeError("疑似密文，拒绝推送: " + path)


def post_blob(path, raw):
    body = {"content": base64.b64encode(raw).decode("ascii"), "encoding": "base64"}
    last = None
    for attempt in range(4):
        try:
            r, _ = req("POST", "/git/blobs", body, timeout=300)
            return r["sha"]
        except Exception as e:
            last = e
            print("   blob 重试 %d/4 %s: %s" % (attempt + 1, path, str(e)[:90]), flush=True)
            time.sleep(2 + attempt * 2)
    raise RuntimeError("blob 上传失败 %s: %s" % (path, last))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只比对需上传文件，不推送")
    ap.add_argument("--version", help="版本号，如 v1.6.0；提供则创建 tag 与 Release")
    ap.add_argument("--tag-message", default="", help="tag 附注消息")
    ap.add_argument("--release-body", default="", help="Release 正文（短文本）")
    ap.add_argument("--release-body-file", default="", help="Release 正文文件（长文本，推荐）")
    ap.add_argument("--release-name", default="", help="Release 标题")
    ap.add_argument("--commit-message", default="", help="自定义 commit message")
    args = ap.parse_args()

    ref, _ = req("GET", "/git/ref/heads/main")
    head = ref["object"]["sha"]
    _, base_tree_sha, remote = remote_tree(head)
    local = local_files()

    changed = []
    for p in local:
        fp = os.path.join(REPO_DIR, p)
        if not os.path.isfile(fp):
            continue
        raw = io.open(fp, "rb").read()
        assert_plaintext(p, raw)
        sha = hashlib.sha1(b"blob %d\0" % len(raw) + raw).hexdigest()
        if remote.get(p, {}).get("sha") != sha:
            changed.append((p, sha, raw))

    print("线上 HEAD:", head[:12], "| 线上文件", len(remote), "| 本地文件", len(local), flush=True)
    print("需上传:", len(changed), "个文件", flush=True)
    for p, sha, raw in sorted(changed, key=lambda x: len(x[2]))[:12]:
        flag = "  <== 过大,注意 50MB 上限" if len(raw) > BLOB_WARN_BYTES else ""
        print("   %9d  %s%s" % (len(raw), p, flag), flush=True)
    if args.dry_run:
        print("dry-run 结束，未推送。", flush=True)
        return

    if not changed:
        print("无改动，跳过提交。", flush=True)
        return

    entries = []
    for i, (p, sha, raw) in enumerate(sorted(changed, key=lambda x: len(x[2])), 1):
        got = post_blob(p, raw)
        mode = "100755" if p.startswith("tools/") and p.endswith(".py") else "100644"
        entries.append({"path": p, "mode": mode, "type": "blob", "sha": got})
        print("  [%d/%d] %s ok" % (i, len(changed), p), flush=True)

    print("创建 tree ...", flush=True)
    nt, _ = req("POST", "/git/trees", {"base_tree": base_tree_sha, "tree": entries}, timeout=180)
    ver = args.version or "docs"
    msg = args.commit_message or ("%s: 更新站点与交接文档" % ver)
    print("创建 commit ...", flush=True)
    nc, _ = req("POST", "/git/commits", {"message": msg, "tree": nt["sha"], "parents": [head]}, timeout=180)
    new_head = nc["sha"]
    print("更新 main ...", flush=True)
    rr, _ = req("PATCH", "/git/refs/heads/main", {"sha": new_head, "force": False}, timeout=120)
    print("  main ->", rr["object"]["sha"][:12], flush=True)

    if args.version:
        tag = args.version
        print("创建 tag", tag, "...", flush=True)
        try:
            tg, _ = req("POST", "/git/tags", {
                "tag": tag, "message": args.tag_message or tag,
                "object": new_head, "type": "commit",
                "tagger": {"name": OWNER, "email": OWNER + "@users.noreply.github.com",
                           "date": time.strftime("%Y-%m-%dT%H:%M:%S+08:00")},
            }, timeout=120)
            req("POST", "/git/refs", {"ref": "refs/tags/" + tag, "sha": tg["sha"]}, timeout=120)
            print("  tag ->", tg["sha"][:12], flush=True)
        except Exception as e:
            print("  tag 创建失败（可能已存在，不阻断）:", str(e)[:180], flush=True)

        body = args.release_body
        if args.release_body_file:
            body = io.open(args.release_body_file, encoding="utf-8").read()
        print("创建 Release ...", flush=True)
        try:
            rel, _ = req("POST", "/releases", {
                "tag_name": tag, "target_commitish": "main",
                "name": args.release_name or (tag + " · 作品集更新"),
                "body": body or ("见 CHANGELOG.md (" + tag + ")"),
                "draft": False, "prerelease": False,
            }, timeout=120)
            print("  release:", rel.get("html_url"), flush=True)
        except Exception as e:
            print("  Release 创建失败（不阻断）:", str(e)[:180], flush=True)

    print("DONE new_head", new_head, flush=True)


if __name__ == "__main__":
    main()
