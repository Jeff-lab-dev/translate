#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 敏感信息检查 — pre-push 钩子扫描
# 扫描即将推送的代码中的密钥、Token、密码
# ─────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FOUND=0

echo -e "${YELLOW}🔍 扫描敏感信息...${NC}"

# ── 获取变更文件 ──────────────────────────────────────────
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  FILES=$(git diff --name-only --cached 2>/dev/null || git diff --name-only origin/main..HEAD 2>/dev/null || echo "")
else
  FILES=$(git diff --name-only --cached 2>/dev/null || git ls-files || echo "")
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}✅ 无变更，跳过${NC}"
  exit 0
fi

# ── 排除列表 ──────────────────────────────────────────────
EXCLUDE="pnpm-lock.yaml|\.gitignore|\.prettierrc|README\.md|check-secrets\.sh"

check_file() {
  local file="$1"
  [ ! -f "$file" ] && return
  echo "$file" | grep -qE "$EXCLUDE" && return
  file -b "$file" 2>/dev/null | grep -qi "binary" && return

  local content
  content=$(cat "$file" 2>/dev/null) || return

  local line_num=0
  while IFS= read -r line; do
    line_num=$((line_num + 1))

    # GitHub tokens
    if echo "$line" | grep -qE 'ghp_[a-zA-Z0-9]{36}'; then
      echo -e "${RED}🚨 [CRITICAL] GitHub Classic PAT${NC} → ${YELLOW}${file}:${line_num}${NC}"
      FOUND=1
    fi
    if echo "$line" | grep -qE 'github_pat_[a-zA-Z0-9_]{22,}'; then
      echo -e "${RED}🚨 [CRITICAL] GitHub Fine-grained PAT${NC} → ${YELLOW}${file}:${line_num}${NC}"
      FOUND=1
    fi

    # OpenAI / LLM keys
    if echo "$line" | grep -qE 'sk-[a-zA-Z0-9]{32,}'; then
      echo -e "${RED}🚨 [HIGH] API Key (sk-...)${NC} → ${YELLOW}${file}:${line_num}${NC}"
      FOUND=1
    fi

    # AWS keys
    if echo "$line" | grep -qE 'AKIA[0-9A-Z]{16}'; then
      echo -e "${RED}🚨 [HIGH] AWS Access Key${NC} → ${YELLOW}${file}:${line_num}${NC}"
      FOUND=1
    fi

    # Private keys
    if echo "$line" | grep -qE -- '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'; then
      echo -e "${RED}🚨 [CRITICAL] Private Key${NC} → ${YELLOW}${file}:${line_num}${NC}"
      FOUND=1
    fi

    # Hardcoded credentials in assignments
    if echo "$line" | grep -qiE '(api_key|apikey|secret|password|token)\s*[:=]\s*["'"'"'][a-zA-Z0-9_\-]{10,}["'"'"']'; then
      echo -e "${RED}🚨 [HIGH] Hardcoded credential${NC} → ${YELLOW}${file}:${line_num}${NC}"
      FOUND=1
    fi

    # MongoDB / Postgres connection strings
    if echo "$line" | grep -qE '(mongodb|postgres(ql)?|mysql)://[^/@]+:[^/@]+@'; then
      echo -e "${RED}🚨 [HIGH] DB connection string${NC} → ${YELLOW}${file}:${line_num}${NC}"
      FOUND=1
    fi
  done <<< "$content"
}

# ── 逐文件扫描 ────────────────────────────────────────────
while IFS= read -r f; do
  [ -n "$f" ] && check_file "$f"
done <<< "$FILES"

# ── .env 检查 ─────────────────────────────────────────────
while IFS= read -r f; do
  if echo "$f" | grep -qE '\.env$|\.env\.'; then
    if ! git check-ignore "$f" >/dev/null 2>&1; then
      echo -e "${RED}🚨 [HIGH] .env 文件未被 gitignore${NC} → ${YELLOW}${f}${NC}"
      FOUND=1
    fi
  fi
done <<< "$FILES"

# ── 结果 ──────────────────────────────────────────────────
if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo -e "${RED}⛔ 发现敏感信息，推送已阻止！${NC}"
  echo "  1. 移除真实密钥/Token → 改用环境变量"
  echo "  2. 如误报 → 编辑 scripts/check-secrets.sh"
  exit 1
else
  echo -e "${GREEN}✅ 安全扫描通过${NC}"
  exit 0
fi
